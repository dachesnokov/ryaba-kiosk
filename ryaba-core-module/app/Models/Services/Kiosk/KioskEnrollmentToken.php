<?php

namespace App\Models\Services\Kiosk;

use Illuminate\Database\Eloquent\Model;

class KioskEnrollmentToken extends Model
{
    protected $table = 'service_kiosk_enrollment_tokens';

    protected $fillable = [
        'name',
        'token_hash',
        'expires_at',
        'max_uses',
        'used_count',
        'profile_id',
        'is_active',
        'created_by',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'is_active' => 'boolean',
    ];

    public function profile()
    {
        return $this->belongsTo(KioskProfile::class, 'profile_id');
    }

    public function canBeUsed(): bool
    {
        if (!$this->is_active) {
            return false;
        }

        if ($this->expires_at && $this->expires_at->isPast()) {
            return false;
        }

        if ($this->max_uses !== null && $this->used_count >= $this->max_uses) {
            return false;
        }

        return true;
    }
}
