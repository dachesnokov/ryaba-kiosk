<?php

namespace App\Http\Controllers\Api\Services\Kiosk;

use App\Http\Controllers\Controller;
use App\Models\Services\Kiosk\KioskCommand;
use App\Models\Services\Kiosk\KioskDevice;
use App\Models\Services\Kiosk\KioskEnrollmentToken;
use App\Models\Services\Kiosk\KioskProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class KioskAdminController extends Controller
{
    private function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    private function configVersionNow(): int
    {
        return (int) round(microtime(true) * 1000);
    }

    public function dashboard()
    {
        return response()->json([
            'total' => KioskDevice::query()->count(),
            'online' => KioskDevice::query()->where('status', 'online')->count(),
            'pending' => KioskDevice::query()->where('status', 'pending')->count(),
            'offline' => KioskDevice::query()
                ->where(function ($q) {
                    $q->whereNull('last_seen_at')->orWhere('last_seen_at', '<', now()->subMinutes(2));
                })
                ->count(),
        ]);
    }

    public function downloadRpm()
    {
        $files = glob(storage_path('app/public/kiosk/ryaba-kiosk-shell-*.rpm')) ?: [];

        usort($files, static fn ($a, $b) => filemtime($b) <=> filemtime($a));

        $file = $files[0] ?? null;

        if (!$file || !is_file($file)) {
            return response()->json([
                'message' => 'RPM-файл не найден. Скопируйте пакет в storage/app/public/kiosk/.',
            ], 404);
        }

        return response()->download($file, basename($file), [
            'Content-Type' => 'application/x-rpm',
        ]);
    }


    public function devices()
    {
        $devices = KioskDevice::query()
            ->with('profile:id,name')
            ->latest('last_seen_at')
            ->paginate(50);

        return response()->json($devices);
    }

    public function approve(Request $request, KioskDevice $device)
    {
        $device->status = 'online';
        $device->approved_at = now();
        $device->approved_by = optional($request->user())->id;
        $device->save();

        return response()->json(['ok' => true, 'device' => $device->fresh('profile')]);
    }

    public function updateDevice(Request $request, KioskDevice $device)
    {
        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'profile_id' => ['nullable', 'integer', 'exists:service_kiosk_profiles,id'],
            'building_id' => ['nullable', 'integer'],
            'cabinet_id' => ['nullable', 'integer'],
            'status' => ['nullable', 'string', 'max:50'],
            'config_override' => ['nullable', 'array'],
        ]);

        $shouldBumpConfigVersion = false;

        if (array_key_exists('config_override', $data)) {
            $meta = $device->meta ?: [];
            $meta['config_override'] = $data['config_override'] ?: [];
            $meta['config_updated_at'] = $this->configVersionNow();
            $device->meta = $meta;
            $shouldBumpConfigVersion = true;
            unset($data['config_override']);
        }

        if (array_key_exists('profile_id', $data) && (string) ($data['profile_id'] ?? '') !== (string) ($device->profile_id ?? '')) {
            $meta = $device->meta ?: [];
            $meta['config_updated_at'] = $this->configVersionNow();
            $device->meta = $meta;
            $shouldBumpConfigVersion = true;
        }

        $device->fill($data);

        if ($shouldBumpConfigVersion) {
            $device->updated_at = now();
        }

        $device->save();

        return response()->json(['ok' => true, 'device' => $device->fresh('profile')]);
    }

    public function createCommand(Request $request, KioskDevice $device)
    {
        $data = $request->validate([
            'type' => ['required', 'string', 'max:255'],
            'payload' => ['nullable', 'array'],
        ]);

        $command = KioskCommand::query()->create([
            'device_id' => $device->id,
            'type' => $data['type'],
            'payload' => $data['payload'] ?? [],
            'status' => 'pending',
            'requested_by' => optional($request->user())->id,
            'requested_at' => now(),
        ]);

        return response()->json(['ok' => true, 'command' => $command]);
    }

    public function deleteDevice(KioskDevice $device)
    {
        $device->delete();

        return response()->json(['ok' => true]);
    }

    public function profiles()
    {
        return response()->json([
            'data' => KioskProfile::query()->orderBy('name')->get(),
        ]);
    }

    public function saveProfile(Request $request, ?KioskProfile $profile = null)
    {
        $profile ??= new KioskProfile();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'home_url' => ['nullable', 'string', 'max:2048'],
            'allowed_origins' => ['nullable', 'array'],
            'allowed_paths' => ['nullable', 'array'],
            'settings' => ['nullable', 'array'],
            'is_default' => ['nullable', 'boolean'],
        ]);

        if (($data['is_default'] ?? false) === true) {
            KioskProfile::query()->where('id', '!=', $profile->id)->update(['is_default' => false]);
        }

        $profile->fill($data);
        if (!$profile->exists) {
            $profile->created_by = optional($request->user())->id;
        }
        $profile->save();

        $version = $this->configVersionNow();

        KioskDevice::query()
            ->where('profile_id', $profile->id)
            ->get()
            ->each(function (KioskDevice $device) use ($version) {
                $meta = $device->meta ?: [];
                $meta['config_updated_at'] = $version;
                $device->meta = $meta;
                $device->save();
            });

        return response()->json(['ok' => true, 'profile' => $profile]);
    }

    public function deleteProfile(KioskProfile $profile)
    {
        \Illuminate\Support\Facades\DB::transaction(function () use ($profile) {
            KioskDevice::query()
                ->where('profile_id', $profile->id)
                ->update(['profile_id' => null]);

            KioskEnrollmentToken::query()
                ->where('profile_id', $profile->id)
                ->update(['profile_id' => null]);

            $wasDefault = (bool) $profile->is_default;

            $profile->delete();

            if ($wasDefault) {
                $next = KioskProfile::query()->orderBy('id')->first();
                if ($next) {
                    $next->is_default = true;
                    $next->save();
                }
            }
        });

        return response()->json(['ok' => true]);
    }

    public function createEnrollmentToken(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'profile_id' => ['nullable', 'integer', 'exists:service_kiosk_profiles,id'],
            'expires_at' => ['nullable', 'date'],
            'max_uses' => ['nullable', 'integer', 'min:1'],
        ]);

        $plain = Str::random(48);

        $token = KioskEnrollmentToken::query()->create([
            'name' => $data['name'],
            'token_hash' => $this->hashToken($plain),
            'profile_id' => $data['profile_id'] ?? null,
            'expires_at' => $data['expires_at'] ?? null,
            'max_uses' => $data['max_uses'] ?? null,
            'created_by' => optional($request->user())->id,
            'is_active' => true,
        ]);

        return response()->json([
            'ok' => true,
            'token' => $token,
            'plain_token' => $plain,
            'message' => 'Сохраните токен сейчас. Повторно он показан не будет.',
        ]);
    }
}
