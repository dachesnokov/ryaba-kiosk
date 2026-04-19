import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const defaultProfile = {
    name: 'Основной профиль киоска',
    description: '',
    home_url: 'https://ra.spo-kp.ru',
    allowed_origins: ['https://ra.spo-kp.ru'],
    allowed_paths: ['/*'],
    settings: {
        allow_camera: true,
        allow_microphone: true,
        block_downloads: true,
        show_admin_panel: true,
        admin_pin: '123456',
        heartbeat_seconds: 30,
        commands_seconds: 15,
    },
    is_default: true,
};

function Badge({ children, tone = 'slate' }) {
    const cls = {
        green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
        yellow: 'bg-amber-50 text-amber-700 ring-amber-200',
        red: 'bg-rose-50 text-rose-700 ring-rose-200',
        slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    }[tone] || 'bg-slate-100 text-slate-700 ring-slate-200';

    return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${cls}`}>{children}</span>;
}

function statusTone(device) {
    if (device.status === 'pending') return 'yellow';
    if (!device.last_seen_at) return 'red';

    const diff = Date.now() - new Date(device.last_seen_at).getTime();
    if (diff > 2 * 60 * 1000) return 'red';

    return device.status === 'online' ? 'green' : 'slate';
}

function splitLines(value) {
    return String(value || '')
        .split('\n')
        .map((row) => row.trim())
        .filter(Boolean);
}

function lines(value) {
    return Array.isArray(value) ? value.join('\n') : '';
}

function deviceOverride(device) {
    return device?.meta?.config_override || {};
}

function effectiveHome(device) {
    return deviceOverride(device).homeUrl || device?.profile?.home_url || '';
}

export default function ServiceKioskPage({ user }) {
    const [dashboard, setDashboard] = useState(null);
    const [devices, setDevices] = useState([]);
    const [profiles, setProfiles] = useState([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState(null);
    const [profileForm, setProfileForm] = useState(defaultProfile);
    const [tokenName, setTokenName] = useState('Регистрация киосков');
    const [tokenProfileId, setTokenProfileId] = useState('');
    const [plainToken, setPlainToken] = useState('');
    const [loading, setLoading] = useState(true);
    const [savingDevice, setSavingDevice] = useState(false);
    const [deviceForm, setDeviceForm] = useState({
        name: '',
        profile_id: '',
        homeUrl: '',
        allowedOrigins: '',
        allowedPaths: '/*',
        allowCamera: true,
        allowMicrophone: true,
        blockDownloads: true,
        showAdminPanel: true,
    });

    const selectedDevice = useMemo(
        () => devices.find((device) => Number(device.id) === Number(selectedDeviceId)) || null,
        [devices, selectedDeviceId]
    );

    async function load() {
        setLoading(true);

        const [dash, devs, profs] = await Promise.all([
            axios.get('/api/admin/services/kiosks/dashboard'),
            axios.get('/api/admin/services/kiosks/devices'),
            axios.get('/api/admin/services/kiosks/profiles'),
        ]);

        const rows = devs.data.data || [];
        const profileRows = profs.data.data || [];

        setDashboard(dash.data);
        setDevices(rows);
        setProfiles(profileRows);

        if (!selectedDeviceId && rows.length) {
            setSelectedDeviceId(rows[0].id);
        }

        if (!tokenProfileId && profileRows.length) {
            setTokenProfileId(profileRows.find((p) => p.is_default)?.id || profileRows[0].id);
        }

        setLoading(false);
    }

    useEffect(() => {
        load();
        const timer = setInterval(load, 15000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!selectedDevice) return;

        const override = deviceOverride(selectedDevice);
        const settings = selectedDevice.profile?.settings || {};

        setDeviceForm({
            name: selectedDevice.name || selectedDevice.hostname || '',
            profile_id: selectedDevice.profile_id || '',
            homeUrl: override.homeUrl || selectedDevice.profile?.home_url || '',
            allowedOrigins: lines(override.allowedOrigins || selectedDevice.profile?.allowed_origins || []),
            allowedPaths: lines(override.allowedPaths || selectedDevice.profile?.allowed_paths || ['/*']),
            allowCamera: override.allowCamera ?? settings.allow_camera ?? true,
            allowMicrophone: override.allowMicrophone ?? settings.allow_microphone ?? true,
            blockDownloads: override.blockDownloads ?? settings.block_downloads ?? true,
            showAdminPanel: override.showAdminPanel ?? settings.show_admin_panel ?? true,
        });
    }, [selectedDeviceId, selectedDevice?.updated_at]);

    async function saveProfile() {
        await axios.post('/api/admin/services/kiosks/profiles', profileForm);
        setProfileForm(defaultProfile);
        await load();
    }

    async function createToken() {
        const { data } = await axios.post('/api/admin/services/kiosks/enrollment-tokens', {
            name: tokenName,
            profile_id: tokenProfileId || profiles[0]?.id || null,
            max_uses: 100,
        });

        setPlainToken(data.plain_token);
    }

    function downloadRpm() {
        window.open('/api/admin/services/kiosks/download-rpm', '_blank');
    }

    async function approve(device) {
        await axios.post(`/api/admin/services/kiosks/devices/${device.id}/approve`);
        await load();
    }

    async function command(device, type) {
        await axios.post(`/api/admin/services/kiosks/devices/${device.id}/command`, { type, payload: {} });
        await load();
    }

    async function saveDeviceConfig() {
        if (!selectedDevice) return;

        setSavingDevice(true);

        let origin = '';
        try {
            origin = new URL(deviceForm.homeUrl).origin;
        } catch (_) {
            origin = '';
        }

        const allowedOrigins = splitLines(deviceForm.allowedOrigins);
        const allowedPaths = splitLines(deviceForm.allowedPaths);

        await axios.patch(`/api/admin/services/kiosks/devices/${selectedDevice.id}`, {
            name: deviceForm.name,
            profile_id: deviceForm.profile_id || null,
            config_override: {
                homeUrl: deviceForm.homeUrl,
                allowedOrigins: allowedOrigins.length ? allowedOrigins : (origin ? [origin] : []),
                allowedPaths: allowedPaths.length ? allowedPaths : ['/*'],
                allowCamera: !!deviceForm.allowCamera,
                allowMicrophone: !!deviceForm.allowMicrophone,
                blockDownloads: !!deviceForm.blockDownloads,
                showAdminPanel: !!deviceForm.showAdminPanel,
            },
        });

        await command(selectedDevice, 'go_home');
        await load();
        setSavingDevice(false);
    }

    async function resetDeviceOverride() {
        if (!selectedDevice) return;

        await axios.patch(`/api/admin/services/kiosks/devices/${selectedDevice.id}`, {
            config_override: {},
        });

        await command(selectedDevice, 'go_home');
        await load();
    }

    async function deleteSelectedDevice() {
        if (!selectedDevice) return;

        const label = selectedDevice.name || selectedDevice.hostname || `Киоск #${selectedDevice.id}`;
        if (!window.confirm(`Удалить киоск "${label}" из Ryaba?\n\nСамо приложение на МОС не удалится, будет удалена только регистрация и история команд/событий.`)) {
            return;
        }

        await axios.delete(`/api/admin/services/kiosks/devices/${selectedDevice.id}`);
        setSelectedDeviceId(null);
        await load();
    }

    async function deleteProfile(profile) {
        if (!profile) return;

        const usedCount = devices.filter((device) => Number(device.profile_id) === Number(profile.id)).length;
        const suffix = usedCount
            ? `\n\nК этому профилю привязано устройств: ${usedCount}. Их привязка к профилю будет очищена.`
            : '';

        if (!window.confirm(`Удалить профиль "${profile.name}"?${suffix}`)) {
            return;
        }

        await axios.delete(`/api/admin/services/kiosks/profiles/${profile.id}`);

        if (Number(tokenProfileId) === Number(profile.id)) {
            setTokenProfileId('');
        }

        await load();
    }

    const stats = useMemo(() => [
        ['Всего', dashboard?.total ?? 0],
        ['Онлайн', dashboard?.online ?? 0],
        ['Ожидают', dashboard?.pending ?? 0],
        ['Офлайн', dashboard?.offline ?? 0],
    ], [dashboard]);

    return (
        <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
            <div className="mx-auto flex max-w-7xl flex-col gap-5">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Сервисы</div>
                        <h1 className="text-3xl font-bold">Киоски</h1>
                        <p className="mt-1 text-sm text-slate-500">
                            Управление информационными киосками Ryaba Kiosk Shell.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={downloadRpm} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                            Скачать RPM
                        </button>
                        <button onClick={load} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                            Обновить
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-4 gap-4">
                    {stats.map(([label, value]) => (
                        <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="text-sm text-slate-500">{label}</div>
                            <div className="mt-2 text-3xl font-bold">{value}</div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-12 gap-5">
                    <section className="col-span-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-xl font-bold">Устройства</h2>
                            {loading ? <span className="text-sm text-slate-400">загрузка...</span> : null}
                        </div>

                        <div className="overflow-hidden rounded-xl border border-slate-200">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                                    <tr>
                                        <th className="px-3 py-3">Название</th>
                                        <th className="px-3 py-3">Статус</th>
                                        <th className="px-3 py-3">IP</th>
                                        <th className="px-3 py-3">Сайт</th>
                                        <th className="px-3 py-3">Последняя связь</th>
                                        <th className="px-3 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {devices.map((device) => (
                                        <tr
                                            key={device.id}
                                            onClick={() => setSelectedDeviceId(device.id)}
                                            className={`cursor-pointer ${Number(selectedDeviceId) === Number(device.id) ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                                        >
                                            <td className="px-3 py-3">
                                                <div className="font-semibold">{device.name || device.hostname || 'Киоск'}</div>
                                                <div className="text-xs text-slate-500">{device.profile?.name || 'Профиль не назначен'}</div>
                                            </td>
                                            <td className="px-3 py-3">
                                                <Badge tone={statusTone(device)}>{device.status}</Badge>
                                            </td>
                                            <td className="px-3 py-3">{device.ip_address || '—'}</td>
                                            <td className="max-w-[220px] truncate px-3 py-3">{effectiveHome(device) || '—'}</td>
                                            <td className="px-3 py-3">{device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : '—'}</td>
                                            <td className="px-3 py-3">
                                                <div className="flex gap-2">
                                                    {device.status === 'pending' ? (
                                                        <button onClick={(e) => { e.stopPropagation(); approve(device); }} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
                                                            Принять
                                                        </button>
                                                    ) : null}
                                                    <button onClick={(e) => { e.stopPropagation(); command(device, 'go_home'); }} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                                                        Применить
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {!devices.length ? (
                                        <tr>
                                            <td colSpan="6" className="px-3 py-8 text-center text-slate-500">
                                                Устройства пока не зарегистрированы.
                                            </td>
                                        </tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <aside className="col-span-5 flex flex-col gap-5">
                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <h2 className="text-xl font-bold">Конфиг устройства</h2>

                            {!selectedDevice ? (
                                <p className="mt-3 text-sm text-slate-500">Выберите устройство слева.</p>
                            ) : (
                                <div className="mt-4 flex flex-col gap-3">
                                    <label className="text-sm font-semibold text-slate-600">
                                        Название
                                        <input
                                            value={deviceForm.name}
                                            onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })}
                                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                        />
                                    </label>

                                    <label className="text-sm font-semibold text-slate-600">
                                        Профиль
                                        <select
                                            value={deviceForm.profile_id || ''}
                                            onChange={(e) => setDeviceForm({ ...deviceForm, profile_id: e.target.value })}
                                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                        >
                                            <option value="">Не назначен</option>
                                            {profiles.map((profile) => (
                                                <option key={profile.id} value={profile.id}>{profile.name}</option>
                                            ))}
                                        </select>
                                    </label>

                                    <label className="text-sm font-semibold text-slate-600">
                                        Веб-страница этого киоска
                                        <input
                                            value={deviceForm.homeUrl}
                                            onChange={(e) => setDeviceForm({ ...deviceForm, homeUrl: e.target.value })}
                                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                            placeholder="https://ra.spo-kp.ru"
                                        />
                                    </label>

                                    <label className="text-sm font-semibold text-slate-600">
                                        Разрешенные домены, по одному в строке
                                        <textarea
                                            value={deviceForm.allowedOrigins}
                                            onChange={(e) => setDeviceForm({ ...deviceForm, allowedOrigins: e.target.value })}
                                            className="mt-1 h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                        />
                                    </label>

                                    <label className="text-sm font-semibold text-slate-600">
                                        Разрешенные пути, по одному в строке
                                        <textarea
                                            value={deviceForm.allowedPaths}
                                            onChange={(e) => setDeviceForm({ ...deviceForm, allowedPaths: e.target.value })}
                                            className="mt-1 h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                        />
                                    </label>

                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        {[
                                            ['allowCamera', 'Камера'],
                                            ['allowMicrophone', 'Микрофон'],
                                            ['blockDownloads', 'Блокировать загрузки'],
                                            ['showAdminPanel', 'Админ-панель'],
                                        ].map(([key, label]) => (
                                            <label key={key} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                                                <input
                                                    type="checkbox"
                                                    checked={!!deviceForm[key]}
                                                    onChange={(e) => setDeviceForm({ ...deviceForm, [key]: e.target.checked })}
                                                />
                                                {label}
                                            </label>
                                        ))}
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={saveDeviceConfig}
                                            disabled={savingDevice}
                                            className="flex-1 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                                        >
                                            Сохранить и применить
                                        </button>
                                        <button
                                            onClick={resetDeviceOverride}
                                            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
                                        >
                                            Сбросить
                                        </button>
                                        <button
                                            onClick={deleteSelectedDevice}
                                            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
                                        >
                                            Удалить киоск
                                        </button>
                                    </div>
                                </div>
                            )}
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <h2 className="text-xl font-bold">Токен регистрации</h2>
                            <input
                                value={tokenName}
                                onChange={(e) => setTokenName(e.target.value)}
                                className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                placeholder="Название токена"
                            />
                            <select
                                value={tokenProfileId || ''}
                                onChange={(e) => setTokenProfileId(e.target.value)}
                                className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            >
                                {profiles.map((profile) => (
                                    <option key={profile.id} value={profile.id}>{profile.name}</option>
                                ))}
                            </select>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <button onClick={createToken} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                                    Создать токен
                                </button>
                                <button onClick={downloadRpm} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                                    Скачать RPM
                                </button>
                            </div>
                            {plainToken ? (
                                <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                                    <div className="font-bold">Сохраните токен сейчас:</div>
                                    <code className="mt-2 block break-all">{plainToken}</code>
                                </div>
                            ) : null}
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <h2 className="text-xl font-bold">Профили</h2>
                            <div className="mt-4 flex flex-col gap-2">
                                {profiles.map((profile) => (
                                    <div key={profile.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                                        <div>
                                            <div className="font-semibold text-slate-900">{profile.name}</div>
                                            <div className="text-xs text-slate-500">
                                                {profile.is_default ? 'Профиль по умолчанию · ' : ''}
                                                {profile.home_url || 'Без домашнего сайта'}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => deleteProfile(profile)}
                                            className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200"
                                        >
                                            Удалить
                                        </button>
                                    </div>
                                ))}
                                {!profiles.length ? (
                                    <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">
                                        Профили пока не созданы.
                                    </div>
                                ) : null}
                            </div>
                        </section>

                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <h2 className="text-xl font-bold">Быстрый профиль</h2>
                            <input
                                value={profileForm.name}
                                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                                className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                placeholder="Название"
                            />
                            <input
                                value={profileForm.home_url}
                                onChange={(e) => {
                                    let origin = '';
                                    try { origin = new URL(e.target.value).origin; } catch (_) {}
                                    setProfileForm({
                                        ...profileForm,
                                        home_url: e.target.value,
                                        allowed_origins: origin ? [origin] : profileForm.allowed_origins,
                                    });
                                }}
                                className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                placeholder="Домашний URL"
                            />
                            <button onClick={saveProfile} className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                                Создать профиль
                            </button>
                        </section>
                    </aside>
                </div>
            </div>
        </div>
    );
}
