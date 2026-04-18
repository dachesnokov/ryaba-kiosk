<?php

namespace App\Models\Services\Kiosk;

use Illuminate\Database\Eloquent\Model;

class KioskCommand extends Model
{
    protected $table = 'service_kiosk_commands';

    protected $fillable = [
        'device_id',
        'type',
        'payload',
        'status',
        'requested_by',
        'requested_at',
        'executed_at',
        'result',
    ];

    protected $casts = [
        'payload' => 'array',
        'result' => 'array',
        'requested_at' => 'datetime',
        'executed_at' => 'datetime',
    ];
}
