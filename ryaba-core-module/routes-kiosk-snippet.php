<?php

use App\Http\Controllers\Api\Services\Kiosk\KioskAdminController;
use App\Http\Controllers\Api\Services\Kiosk\KioskDeviceApiController;
use Illuminate\Support\Facades\Route;

Route::prefix('services/kiosks')->group(function () {
    Route::post('/enroll', [KioskDeviceApiController::class, 'enroll']);
    Route::post('/heartbeat', [KioskDeviceApiController::class, 'heartbeat']);
    Route::get('/commands', [KioskDeviceApiController::class, 'commands']);
    Route::post('/commands/{command}/result', [KioskDeviceApiController::class, 'commandResult']);
});

Route::middleware(['auth:sanctum'])->prefix('admin/services/kiosks')->group(function () {
    Route::get('/dashboard', [KioskAdminController::class, 'dashboard']);
    Route::get('/devices', [KioskAdminController::class, 'devices']);
    Route::post('/devices/{device}/approve', [KioskAdminController::class, 'approve']);
    Route::patch('/devices/{device}', [KioskAdminController::class, 'updateDevice']);
    Route::post('/devices/{device}/command', [KioskAdminController::class, 'createCommand']);

    Route::get('/profiles', [KioskAdminController::class, 'profiles']);
    Route::post('/profiles', [KioskAdminController::class, 'saveProfile']);
    Route::patch('/profiles/{profile}', [KioskAdminController::class, 'saveProfile']);

    Route::post('/enrollment-tokens', [KioskAdminController::class, 'createEnrollmentToken']);
});
