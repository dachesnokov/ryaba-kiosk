<?php

namespace App\Models\Services\Kiosk;

use Illuminate\Database\Eloquent\Model;

class KioskEvent extends Model
{
    protected $table = 'service_kiosk_events';

    protected $fillable = [
        'device_id',
        'level',
        'type',
        'message',
        'payload',
    ];

    protected $casts = [
        'payload' => 'array',
    ];
}
