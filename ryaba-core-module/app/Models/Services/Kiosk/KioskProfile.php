<?php

namespace App\Models\Services\Kiosk;

use Illuminate\Database\Eloquent\Model;

class KioskProfile extends Model
{
    protected $table = 'service_kiosk_profiles';

    protected $fillable = [
        'name',
        'description',
        'home_url',
        'allowed_origins',
        'allowed_paths',
        'settings',
        'is_default',
        'created_by',
    ];

    protected $casts = [
        'allowed_origins' => 'array',
        'allowed_paths' => 'array',
        'settings' => 'array',
        'is_default' => 'boolean',
    ];

    public function toClientConfig(): array
    {
        $settings = $this->settings ?: [];

        return [
            'homeUrl' => $this->home_url,
            'allowedOrigins' => $this->allowed_origins ?: [],
            'allowedPaths' => $this->allowed_paths ?: ['/*'],
            'allowCamera' => (bool)($settings['allow_camera'] ?? true),
            'allowMicrophone' => (bool)($settings['allow_microphone'] ?? true),
            'blockDownloads' => (bool)($settings['block_downloads'] ?? true),
            'showAdminPanel' => (bool)($settings['show_admin_panel'] ?? true),
            'adminPin' => (string)($settings['admin_pin'] ?? '123456'),
            'heartbeatSeconds' => (int)($settings['heartbeat_seconds'] ?? 30),
            'commandsSeconds' => (int)($settings['commands_seconds'] ?? 15),
        ];
    }
}
