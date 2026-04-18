<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('service_kiosk_profiles', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('home_url')->nullable();
            $table->json('allowed_origins')->nullable();
            $table->json('allowed_paths')->nullable();
            $table->json('settings')->nullable();
            $table->boolean('is_default')->default(false);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('service_kiosk_devices', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('name')->nullable();
            $table->string('status')->default('pending')->index();
            $table->string('hostname')->nullable();
            $table->string('machine_id_hash')->nullable()->index();
            $table->string('os_name')->nullable();
            $table->string('os_version')->nullable();
            $table->string('app_version')->nullable();
            $table->ipAddress('ip_address')->nullable();
            $table->json('mac_addresses')->nullable();
            $table->foreignId('profile_id')->nullable()->constrained('service_kiosk_profiles')->nullOnDelete();
            $table->foreignId('building_id')->nullable()->constrained('buildings')->nullOnDelete();
            $table->foreignId('cabinet_id')->nullable()->constrained('cabinets')->nullOnDelete();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('registered_at')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('device_token_hash')->nullable();
            $table->json('last_payload')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();
        });

        Schema::create('service_kiosk_enrollment_tokens', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('token_hash')->unique();
            $table->timestamp('expires_at')->nullable();
            $table->unsignedInteger('max_uses')->nullable();
            $table->unsignedInteger('used_count')->default(0);
            $table->foreignId('profile_id')->nullable()->constrained('service_kiosk_profiles')->nullOnDelete();
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('service_kiosk_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained('service_kiosk_devices')->cascadeOnDelete();
            $table->string('level')->default('info');
            $table->string('type')->index();
            $table->text('message')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();
        });

        Schema::create('service_kiosk_commands', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained('service_kiosk_devices')->cascadeOnDelete();
            $table->string('type');
            $table->json('payload')->nullable();
            $table->string('status')->default('pending')->index();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('requested_at')->nullable();
            $table->timestamp('executed_at')->nullable();
            $table->json('result')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('service_kiosk_commands');
        Schema::dropIfExists('service_kiosk_events');
        Schema::dropIfExists('service_kiosk_enrollment_tokens');
        Schema::dropIfExists('service_kiosk_devices');
        Schema::dropIfExists('service_kiosk_profiles');
    }
};
