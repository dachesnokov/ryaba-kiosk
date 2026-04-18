<?php

namespace App\Models\Services\Kiosk;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class KioskDevice extends Model
{
    protected $table = 'service_kiosk_devices';

    protected $fillable = [
        'uuid',
        'name',
        'status',
        'hostname',
        'machine_id_hash',
        'os_name',
        'os_version',
        'app_version',
        'ip_address',
        'mac_addresses',
        'profile_id',
        'building_id',
        'cabinet_id',
        'last_seen_at',
        'registered_at',
        'approved_at',
        'approved_by',
        'device_token_hash',
        'last_payload',
        'meta',
    ];

    protected $casts = [
        'mac_addresses' => 'array',
        'last_payload' => 'array',
        'meta' => 'array',
        'last_seen_at' => 'datetime',
        'registered_at' => 'datetime',
        'approved_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $device) {
            if (!$device->uuid) {
                $device->uuid = (string) Str::uuid();
            }
        });
    }

    public function profile()
    {
        return $this->belongsTo(KioskProfile::class, 'profile_id');
    }

    public function commands()
    {
        return $this->hasMany(KioskCommand::class, 'device_id');
    }

    public function events()
    {
        return $this->hasMany(KioskEvent::class, 'device_id');
    }
}
