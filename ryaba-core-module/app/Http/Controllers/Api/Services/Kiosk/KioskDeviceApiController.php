<?php

namespace App\Http\Controllers\Api\Services\Kiosk;

use App\Http\Controllers\Controller;
use App\Models\Services\Kiosk\KioskCommand;
use App\Models\Services\Kiosk\KioskDevice;
use App\Models\Services\Kiosk\KioskEnrollmentToken;
use App\Models\Services\Kiosk\KioskProfile;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class KioskDeviceApiController extends Controller
{
    private function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    private function deviceByBearer(Request $request): ?KioskDevice
    {
        $token = $request->bearerToken();
        if (!$token) {
            return null;
        }

        return KioskDevice::query()
            ->where('device_token_hash', $this->hashToken($token))
            ->first();
    }

    public function enroll(Request $request)
    {
        $data = $request->validate([
            'enrollment_token' => ['required', 'string'],
            'device' => ['required', 'array'],
            'device.hostname' => ['nullable', 'string', 'max:255'],
            'device.machineIdHash' => ['required', 'string', 'max:128'],
            'device.release' => ['nullable', 'string', 'max:255'],
            'device.platform' => ['nullable', 'string', 'max:255'],
            'device.appVersion' => ['nullable', 'string', 'max:255'],
            'device.macAddresses' => ['nullable', 'array'],
            'device.localIps' => ['nullable', 'array'],
            'device.primaryIp' => ['nullable', 'string', 'max:64'],
        ]);

        $tokenHash = $this->hashToken($data['enrollment_token']);
        $enrollment = KioskEnrollmentToken::query()->where('token_hash', $tokenHash)->first();

        if (!$enrollment || !$enrollment->canBeUsed()) {
            return response()->json(['message' => 'Недействительный токен регистрации киоска.'], 403);
        }

        $payload = $data['device'];
        $device = KioskDevice::query()
            ->where('machine_id_hash', $payload['machineIdHash'])
            ->first();

        $deviceToken = Str::random(80);

        if (!$device) {
            $device = new KioskDevice();
            $device->uuid = (string) Str::uuid();
            $device->status = 'pending';
            $device->registered_at = now();
        }

        $device->fill([
            'hostname' => $payload['hostname'] ?? null,
            'name' => $device->name ?: ($payload['hostname'] ?? 'Новый киоск'),
            'machine_id_hash' => $payload['machineIdHash'],
            'os_name' => $payload['platform'] ?? null,
            'os_version' => $payload['release'] ?? null,
            'app_version' => $payload['appVersion'] ?? null,
            'mac_addresses' => $payload['macAddresses'] ?? [],
            'ip_address' => $payload['primaryIp'] ?? $request->ip(),
            'profile_id' => $device->profile_id ?: $enrollment->profile_id,
            'last_payload' => $payload,
            'last_seen_at' => now(),
            'device_token_hash' => $this->hashToken($deviceToken),
        ]);
        $device->save();

        $enrollment->increment('used_count');

        return response()->json([
            'device_uuid' => $device->uuid,
            'device_token' => $deviceToken,
            'status' => $device->status,
        ]);
    }

    public function heartbeat(Request $request)
    {
        $device = $this->deviceByBearer($request);
        if (!$device) {
            return response()->json(['message' => 'Устройство не авторизовано.'], 401);
        }

        $data = $request->validate([
            'device' => ['nullable', 'array'],
            'current_url' => ['nullable', 'string', 'max:2048'],
        ]);

        $payload = $data['device'] ?? [];

        $device->fill([
            'last_seen_at' => now(),
            'ip_address' => $payload['primaryIp'] ?? $device->ip_address ?? $request->ip(),
            'hostname' => $payload['hostname'] ?? $device->hostname,
            'os_name' => $payload['platform'] ?? $device->os_name,
            'os_version' => $payload['release'] ?? $device->os_version,
            'app_version' => $payload['appVersion'] ?? $device->app_version,
            'mac_addresses' => $payload['macAddresses'] ?? $device->mac_addresses,
            'last_payload' => array_merge($payload, ['current_url' => $data['current_url'] ?? null]),
        ]);

        if ($device->status === 'pending') {
            $device->save();
            return response()->json([
                'status' => 'pending',
                'message' => 'Устройство ожидает подтверждения администратором.',
            ]);
        }

        $device->status = 'online';
        $device->save();

        $profile = $device->profile ?: KioskProfile::query()->where('is_default', true)->first();

        $config = $profile ? $profile->toClientConfig() : null;
        $override = data_get($device->meta ?: [], 'config_override', []);

        if ($config && is_array($override) && !empty($override)) {
            $cleanOverride = array_filter($override, static fn ($value) => $value !== null && $value !== '');
            $config = array_replace_recursive($config, $cleanOverride);
        }

        if ($config) {
            $config['coreUrl'] = config('app.url');
        }

        $profileVersion = optional($profile?->updated_at)->timestamp ?: 0;
        $deviceVersion = optional($device->updated_at)->timestamp ?: 0;

        return response()->json([
            'status' => $device->status,
            'config_version' => max($profileVersion, $deviceVersion, time()),
            'config' => $config,
        ]);
    }

    public function commands(Request $request)
    {
        $device = $this->deviceByBearer($request);
        if (!$device) {
            return response()->json(['message' => 'Устройство не авторизовано.'], 401);
        }

        $commands = KioskCommand::query()
            ->where('device_id', $device->id)
            ->where('status', 'pending')
            ->orderBy('id')
            ->limit(10)
            ->get();

        $commands->each(function (KioskCommand $command) {
            $command->status = 'sent';
            $command->save();
        });

        return response()->json([
            'commands' => $commands->map(fn (KioskCommand $command) => [
                'id' => $command->id,
                'type' => $command->type,
                'payload' => $command->payload,
            ])->values(),
        ]);
    }

    public function commandResult(Request $request, KioskCommand $command)
    {
        $device = $this->deviceByBearer($request);
        if (!$device || $command->device_id !== $device->id) {
            return response()->json(['message' => 'Команда не найдена.'], 404);
        }

        $data = $request->validate([
            'result' => ['nullable', 'array'],
        ]);

        $command->status = ($data['result']['ok'] ?? false) ? 'done' : 'failed';
        $command->result = $data['result'] ?? [];
        $command->executed_at = now();
        $command->save();

        return response()->json(['ok' => true]);
    }
}
