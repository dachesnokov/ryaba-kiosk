import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const DEFAULT_TOKEN_MAX_USES = 1;

const DEFAULT_PROFILE_FORM = {
    name: 'Основной профиль киоска',
    home_url: 'https://ra.spo-kp.ru',
    description: '',
    is_default: true,
};

const HELP_TABS = [
    {
        id: 'create',
        title: 'Создание профиля и ключа',
        content: (
            <div className="space-y-4 text-sm leading-6 text-slate-600">
                <p>
                    Профиль определяет, какой сайт будет открывать киоск, какие домены разрешены,
                    и какие возможности доступны локально: камера, микрофон, загрузки и админ-панель.
                </p>
                <ol className="list-decimal space-y-2 pl-5">
                    <li>В левой колонке заполните название профиля и домашний сайт.</li>
                    <li>Нажмите <b>Создать профиль и токен</b>.</li>
                    <li>Ryaba создаст профиль и сразу выдаст ключ регистрации под этот профиль.</li>
                    <li>Укажите количество использований токена: 1 для боевого киоска, 10/100 для тестовых установок.</li>
                    <li>Сохраните ключ. Повторно он в открытом виде не показывается.</li>
                </ol>
                <div className="rounded-2xl bg-amber-50 p-4 text-amber-900">
                    RPM универсальный. Профиль не зашивается в пакет. Привязка к профилю выполняется через токен регистрации.
                </div>
            </div>
        ),
    },
    {
        id: 'manage',
        title: 'Управление профилями и устройствами',
        content: (
            <div className="space-y-4 text-sm leading-6 text-slate-600">
                <ol className="list-decimal space-y-2 pl-5">
                    <li>Слева выберите профиль. В центре отобразятся киоски этого профиля.</li>
                    <li>Выберите устройство в центральной таблице.</li>
                    <li>Справа можно поменять имя, профиль, WEB-страницу, разрешенные домены и пути.</li>
                    <li>Нажмите <b>Сохранить и применить</b>, чтобы киоск перешел на новую страницу.</li>
                    <li>Кнопка <b>Удалить киоск</b> удаляет регистрацию в Ryaba, но не удаляет приложение с МОС.</li>
                </ol>
                <div className="rounded-2xl bg-slate-50 p-4 text-slate-700">
                    Киоск получает обновления через heartbeat. Обычно изменение сайта применяется в течение 30 секунд.
                </div>
            </div>
        ),
    },
    {
        id: 'install',
        title: 'Установка на МОС 12',
        content: (
            <div className="space-y-4 text-sm leading-6 text-slate-600">
                <p>Скачайте RPM из Ryaba и установите его на чистую МОС 12.</p>
                <pre className="overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">cd ~/Загрузки && sudo rpm -Uvh ryaba-kiosk-shell-0.1.0-x86_64.rpm</pre>
                <p>После установки запустите <b>Ryaba Kiosk Shell</b> из меню приложений.</p>
                <p>При первом запуске укажите:</p>
                <pre className="overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">Адрес Ryaba Core:
https://ra.spo-kp.ru

Ключ регистрации:
ключ, созданный в Ryaba под нужный профиль

Стартовая страница:
https://ra.spo-kp.ru</pre>
                <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-900">
                    После регистрации устройство появится в списке киосков. Если статус pending — нажмите «Принять».
                </div>
            </div>
        ),
    },
];

function Badge({ children, tone = 'slate' }) {
    const cls = {
        green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
        yellow: 'bg-amber-50 text-amber-700 ring-amber-200',
        red: 'bg-rose-50 text-rose-700 ring-rose-200',
        slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    }[tone] || 'bg-slate-100 text-slate-700 ring-slate-200';

    return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${cls}`}>{children}</span>;
}

function HelpModal({ open, activeTab, setActiveTab, onClose }) {
    if (!open) return null;

    const tab = HELP_TABS.find((item) => item.id === activeTab) || HELP_TABS[0];

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/50 p-6 backdrop-blur-sm">
            <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between border-b border-slate-200 p-6">
                    <div>
                        <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Ryaba Kiosk</div>
                        <h2 className="mt-1 text-2xl font-bold text-slate-900">Инструкция</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                    >
                        Закрыть
                    </button>
                </div>

                <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)]">
                    <div className="border-r border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-2">
                            {HELP_TABS.map((item, index) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setActiveTab(item.id)}
                                    className={`rounded-2xl px-4 py-3 text-left text-sm font-semibold ${
                                        item.id === activeTab
                                            ? 'bg-slate-900 text-white shadow-sm'
                                            : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'
                                    }`}
                                >
                                    <span className="mr-2 opacity-70">{index + 1}.</span>
                                    {item.title}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="min-h-0 overflow-auto p-6">
                        <h3 className="mb-4 text-xl font-bold text-slate-900">{tab.title}</h3>
                        {tab.content}
                    </div>
                </div>
            </div>
        </div>
    );
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

function buildProfilePayload(form) {
    let origin = '';
    try {
        origin = new URL(form.home_url).origin;
    } catch (_) {
        origin = '';
    }

    return {
        name: form.name,
        description: form.description || '',
        home_url: form.home_url,
        allowed_origins: origin ? [origin] : [],
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
        is_default: !!form.is_default,
    };
}


function normalizeTokenMaxUses(value) {
    const parsed = parseInt(String(value ?? '1'), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default function ServiceKioskPage() {
    const [dashboard, setDashboard] = useState(null);
    const [devices, setDevices] = useState([]);
    const [profiles, setProfiles] = useState([]);
    const [tokens, setTokens] = useState([]);
    const [selectedProfileId, setSelectedProfileId] = useState('all');
    const [selectedDeviceId, setSelectedDeviceId] = useState(null);
    const [profileForm, setProfileForm] = useState(DEFAULT_PROFILE_FORM);
    const [plainToken, setPlainToken] = useState('');
    const [tokenMaxUses, setTokenMaxUses] = useState(DEFAULT_TOKEN_MAX_USES);
    const [loading, setLoading] = useState(true);
    const [savingDevice, setSavingDevice] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [helpTab, setHelpTab] = useState('create');
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

    const profileById = useMemo(() => {
        const map = new Map();
        profiles.forEach((profile) => map.set(Number(profile.id), profile));
        return map;
    }, [profiles]);

    const selectedProfile = useMemo(() => {
        if (selectedProfileId === 'all' || selectedProfileId === 'none') return null;
        return profileById.get(Number(selectedProfileId)) || null;
    }, [selectedProfileId, profileById]);

    const selectedDevice = useMemo(
        () => devices.find((device) => Number(device.id) === Number(selectedDeviceId)) || null,
        [devices, selectedDeviceId]
    );

    const selectedProfileTokens = useMemo(() => {
        if (selectedProfileId === 'all') return tokens;
        if (selectedProfileId === 'none') return tokens.filter((token) => !token.profile_id);
        return tokens.filter((token) => Number(token.profile_id) === Number(selectedProfileId));
    }, [tokens, selectedProfileId]);

    const filteredDevices = useMemo(() => {
        if (selectedProfileId === 'all') return devices;
        if (selectedProfileId === 'none') return devices.filter((device) => !device.profile_id);
        return devices.filter((device) => Number(device.profile_id) === Number(selectedProfileId));
    }, [devices, selectedProfileId]);

    function getDeviceHome(device) {
        const override = deviceOverride(device);
        const profile = profileById.get(Number(device.profile_id));
        return override.homeUrl || profile?.home_url || device.profile?.home_url || '';
    }

    async function load() {
        setLoading(true);

        const [dash, devs, profs, toks] = await Promise.all([
            axios.get('/api/admin/services/kiosks/dashboard'),
            axios.get('/api/admin/services/kiosks/devices'),
            axios.get('/api/admin/services/kiosks/profiles'),
            axios.get('/api/admin/services/kiosks/enrollment-tokens'),
        ]);

        const rows = devs.data.data || [];
        const profileRows = profs.data.data || [];
        const tokenRows = toks.data.data || [];

        setDashboard(dash.data);
        setDevices(rows);
        setProfiles(profileRows);
        setTokens(tokenRows);

        if (!selectedDeviceId && rows.length) {
            setSelectedDeviceId(rows[0].id);
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
        const profile = profileById.get(Number(selectedDevice.profile_id)) || {};
        const settings = profile.settings || {};

        setDeviceForm({
            name: selectedDevice.name || selectedDevice.hostname || '',
            profile_id: selectedDevice.profile_id || '',
            homeUrl: override.homeUrl || profile.home_url || '',
            allowedOrigins: lines(override.allowedOrigins || profile.allowed_origins || []),
            allowedPaths: lines(override.allowedPaths || profile.allowed_paths || ['/*']),
            allowCamera: override.allowCamera ?? settings.allow_camera ?? true,
            allowMicrophone: override.allowMicrophone ?? settings.allow_microphone ?? true,
            blockDownloads: override.blockDownloads ?? settings.block_downloads ?? true,
            showAdminPanel: override.showAdminPanel ?? settings.show_admin_panel ?? true,
        });
    }, [selectedDeviceId, selectedDevice?.updated_at, profiles.length]);

    async function createProfileOnly() {
        const { data } = await axios.post('/api/admin/services/kiosks/profiles', buildProfilePayload(profileForm));
        const profile = data.profile;

        setSelectedProfileId(String(profile.id));
        setProfileForm(DEFAULT_PROFILE_FORM);
        await load();

        return profile;
    }

    async function createProfileAndToken() {
        const profile = await createProfileOnly();

        const { data } = await axios.post('/api/admin/services/kiosks/enrollment-tokens', {
            name: `Регистрация: ${profile.name}`,
            profile_id: profile.id,
            max_uses: normalizeTokenMaxUses(tokenMaxUses),
        });

        setPlainToken(data.plain_token);
        await load();
    }

    async function createTokenForSelectedProfile() {
        if (!selectedProfile) {
            alert('Сначала выберите конкретный профиль слева.');
            return;
        }

        const { data } = await axios.post('/api/admin/services/kiosks/enrollment-tokens', {
            name: `Регистрация: ${selectedProfile.name}`,
            profile_id: selectedProfile.id,
            max_uses: normalizeTokenMaxUses(tokenMaxUses),
        });

        setPlainToken(data.plain_token);
        await load();
    }

    async function downloadRpm() {
        try {
            const response = await axios.get('/api/admin/services/kiosks/download-rpm', {
                responseType: 'blob',
            });

            const contentType = response.headers['content-type'] || 'application/x-rpm';
            const blob = new Blob([response.data], { type: contentType });
            const url = window.URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = 'ryaba-kiosk-shell-0.1.0-x86_64.rpm';
            document.body.appendChild(link);
            link.click();
            link.remove();

            window.URL.revokeObjectURL(url);
        } catch (error) {
            alert(error?.response?.data?.message || error.message || 'Не удалось скачать RPM.');
        }
    }

    async function approve(device) {
        await axios.post(`/api/admin/services/kiosks/devices/${device.id}/approve`);
        await load();
    }

    async function command(device, type, payload = {}) {
        await axios.post(`/api/admin/services/kiosks/devices/${device.id}/command`, { type, payload });
        await load();
    }

    async function switchShellMode(mode) {
        if (!selectedDevice) return;

        const label = selectedDevice.name || selectedDevice.hostname || `Киоск #${selectedDevice.id}`;
        const isKiosk = mode === 'kiosk';

        const text = isKiosk
            ? `Включить чистый режим киоска на устройстве "${label}"?\n\nSDDM/рабочий стол будет отключен, ryaba-kiosk-shell будет запущен как отдельный Xorg-сервис.`
            : `Вернуть рабочий стол на устройстве "${label}"?\n\nryaba-kiosk-shell будет отключен, SDDM будет включен.`;

        if (!window.confirm(text)) return;

        await command(selectedDevice, 'helper', {
            action: isKiosk ? 'system.enableKioskMode' : 'system.enableDesktopMode',
            payload: {},
        });

        alert('Команда отправлена на киоск. Устройство применит режим при ближайшем опросе команд.');
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

        if (!window.confirm(`Удалить киоск "${label}" из Ryaba?\n\nСамо приложение на МОС не удалится, будет удалена только регистрация.`)) {
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
            ? `\n\nК этому профилю привязано устройств: ${usedCount}. Их привязка будет очищена.`
            : '';

        if (!window.confirm(`Удалить профиль "${profile.name}"?${suffix}`)) {
            return;
        }

        await axios.delete(`/api/admin/services/kiosks/profiles/${profile.id}`);

        if (String(selectedProfileId) === String(profile.id)) {
            setSelectedProfileId('all');
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
        <div className="min-h-screen bg-slate-50 p-5 text-slate-900">
            <div className="flex w-full max-w-none flex-col gap-5">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Сервисы</div>
                        <h1 className="text-3xl font-bold">Киоски</h1>
                        <p className="mt-1 text-sm text-slate-500">
                            Профили, регистрация и управление информационными киосками Ryaba Kiosk Shell.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setHelpOpen(true)}
                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-base font-black text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                            title="Инструкция"
                        >
                            ?
                        </button>
                        <button
                            type="button"
                            onClick={downloadRpm}
                            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
                        >
                            Скачать RPM
                        </button>
                        <button
                            type="button"
                            onClick={load}
                            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                        >
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
                    <section className="col-span-3 flex min-h-[650px] flex-col gap-5">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold">Профили</h2>
                                <Badge>{profiles.length}</Badge>
                            </div>

                            <div className="mt-4 flex flex-col gap-2">
                                <button
                                    type="button"
                                    onClick={() => setSelectedProfileId('all')}
                                    className={`rounded-2xl px-4 py-3 text-left text-sm font-semibold ${
                                        selectedProfileId === 'all'
                                            ? 'bg-slate-900 text-white'
                                            : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'
                                    }`}
                                >
                                    Все устройства
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setSelectedProfileId('none')}
                                    className={`rounded-2xl px-4 py-3 text-left text-sm font-semibold ${
                                        selectedProfileId === 'none'
                                            ? 'bg-slate-900 text-white'
                                            : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'
                                    }`}
                                >
                                    Без профиля
                                </button>

                                {profiles.map((profile) => (
                                    <div
                                        key={profile.id}
                                        className={`rounded-2xl border p-3 ${
                                            Number(selectedProfileId) === Number(profile.id)
                                                ? 'border-slate-900 bg-slate-900 text-white'
                                                : 'border-slate-200 bg-white text-slate-800'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setSelectedProfileId(String(profile.id))}
                                            className="w-full text-left"
                                        >
                                            <div className="font-semibold">{profile.name}</div>
                                            <div className={`mt-1 truncate text-xs ${Number(selectedProfileId) === Number(profile.id) ? 'text-slate-300' : 'text-slate-500'}`}>
                                                {profile.is_default ? 'По умолчанию · ' : ''}
                                                {profile.home_url || 'Без сайта'}
                                            </div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => deleteProfile(profile)}
                                            className={`mt-3 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                                                Number(selectedProfileId) === Number(profile.id)
                                                    ? 'bg-white/10 text-white ring-1 ring-white/20'
                                                    : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                                            }`}
                                        >
                                            Удалить
                                        </button>
                                    </div>
                                ))}

                                {!profiles.length ? (
                                    <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                                        Профили пока не созданы.
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <h2 className="text-xl font-bold">Новый профиль + токен</h2>
                            <div className="mt-4 flex flex-col gap-3">
                                <input
                                    value={profileForm.name}
                                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                    placeholder="Название профиля"
                                />
                                <input
                                    value={profileForm.home_url}
                                    onChange={(e) => setProfileForm({ ...profileForm, home_url: e.target.value })}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                    placeholder="https://ra.spo-kp.ru"
                                />
                                <label className="flex items-center gap-2 text-sm text-slate-600">
                                    <input
                                        type="checkbox"
                                        checked={!!profileForm.is_default}
                                        onChange={(e) => setProfileForm({ ...profileForm, is_default: e.target.checked })}
                                    />
                                    Профиль по умолчанию
                                </label>
                                <label className="text-sm font-semibold text-slate-600">
                                    Количество использований токена
                                    <input
                                        type="number"
                                        min="1"
                                        max="1000"
                                        value={tokenMaxUses}
                                        onChange={(e) => setTokenMaxUses(e.target.value)}
                                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                        placeholder="1"
                                    />
                                    <span className="mt-1 block text-xs font-normal text-slate-500">
                                        Сколько раз этот токен можно использовать. Для боевого киоска — 1, для тестов — 10/100.
                                    </span>
                                </label>
                                <button
                                    type="button"
                                    onClick={createProfileAndToken}
                                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                                >
                                    Создать профиль и токен
                                </button>
                                <button
                                    type="button"
                                    onClick={createProfileOnly}
                                    className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
                                >
                                    Только профиль
                                </button>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <h2 className="text-xl font-bold">Токен выбранного профиля</h2>
                            <label className="mt-4 block text-sm font-semibold text-slate-600">
                                Количество использований для нового токена
                                <input
                                    type="number"
                                    min="1"
                                    max="1000"
                                    value={tokenMaxUses}
                                    onChange={(e) => setTokenMaxUses(e.target.value)}
                                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                    placeholder="1"
                                />
                            </label>
                            <button
                                type="button"
                                onClick={createTokenForSelectedProfile}
                                disabled={!selectedProfile}
                                className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                Создать токен
                            </button>
                            {plainToken ? (
                                <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                                    <div className="font-bold">Сохраните токен сейчас:</div>
                                    <code className="mt-2 block break-all">{plainToken}</code>
                                </div>
                            ) : null}

                            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <div className="mb-2 text-sm font-bold text-slate-800">Использование токенов</div>
                                <div className="space-y-2">
                                    {selectedProfileTokens.slice(0, 8).map((token) => {
                                        const maxUses = token.max_uses ?? '∞';
                                        const used = token.used_count ?? 0;
                                        const left = token.remaining_uses ?? '∞';
                                        return (
                                            <div key={token.id} className="rounded-xl bg-white p-3 text-xs ring-1 ring-slate-200">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="truncate font-semibold text-slate-800">{token.name}</div>
                                                        <div className="mt-1 text-slate-500">
                                                            {token.profile?.name || 'Без профиля'}
                                                        </div>
                                                    </div>
                                                    <Badge tone={token.can_be_used ? 'green' : 'red'}>
                                                        {token.can_be_used ? 'активен' : 'закрыт'}
                                                    </Badge>
                                                </div>
                                                <div className="mt-2 grid grid-cols-3 gap-2 text-slate-600">
                                                    <div>
                                                        <div className="text-slate-400">Использовано</div>
                                                        <div className="font-bold text-slate-900">{used}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-slate-400">Максимум</div>
                                                        <div className="font-bold text-slate-900">{maxUses}</div>
                                                    </div>
                                                    <div>
                                                        <div className="text-slate-400">Осталось</div>
                                                        <div className="font-bold text-slate-900">{left}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {!selectedProfileTokens.length ? (
                                        <div className="rounded-xl bg-white p-3 text-xs text-slate-500 ring-1 ring-slate-200">
                                            Токены для выбранного профиля пока не созданы.
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="col-span-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold">Устройства</h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    {selectedProfile
                                        ? `Профиль: ${selectedProfile.name}`
                                        : selectedProfileId === 'none'
                                            ? 'Устройства без профиля'
                                            : 'Все зарегистрированные устройства'}
                                </p>
                            </div>
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
                                        <th className="px-3 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredDevices.map((device) => (
                                        <tr
                                            key={device.id}
                                            onClick={() => setSelectedDeviceId(device.id)}
                                            className={`cursor-pointer ${Number(selectedDeviceId) === Number(device.id) ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                                        >
                                            <td className="px-3 py-3">
                                                <div className="font-semibold">{device.name || device.hostname || 'Киоск'}</div>
                                                <div className="text-xs text-slate-500">
                                                    {profileById.get(Number(device.profile_id))?.name || 'Профиль не назначен'}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3">
                                                <Badge tone={statusTone(device)}>{device.status}</Badge>
                                            </td>
                                            <td className="px-3 py-3">{device.ip_address || '—'}</td>
                                            <td className="max-w-[220px] truncate px-3 py-3">{getDeviceHome(device) || '—'}</td>
                                            <td className="px-3 py-3">
                                                <div className="flex gap-2">
                                                    {device.status === 'pending' ? (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => { e.stopPropagation(); approve(device); }}
                                                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                                                        >
                                                            Принять
                                                        </button>
                                                    ) : null}
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); command(device, 'go_home'); }}
                                                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                                                    >
                                                        Применить
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {!filteredDevices.length ? (
                                        <tr>
                                            <td colSpan="5" className="px-3 py-10 text-center text-slate-500">
                                                Устройства не найдены.
                                            </td>
                                        </tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="col-span-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <h2 className="text-xl font-bold">Конфиг устройства</h2>

                        {!selectedDevice ? (
                            <p className="mt-3 text-sm text-slate-500">Выберите устройство в центральной таблице.</p>
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
                                    WEB-страница этого киоска
                                    <input
                                        value={deviceForm.homeUrl}
                                        onChange={(e) => setDeviceForm({ ...deviceForm, homeUrl: e.target.value })}
                                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                        placeholder="https://ra.spo-kp.ru"
                                    />
                                </label>

                                <label className="text-sm font-semibold text-slate-600">
                                    Разрешенные домены
                                    <textarea
                                        value={deviceForm.allowedOrigins}
                                        onChange={(e) => setDeviceForm({ ...deviceForm, allowedOrigins: e.target.value })}
                                        className="mt-1 h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                        placeholder="https://ra.spo-kp.ru"
                                    />
                                </label>

                                <label className="text-sm font-semibold text-slate-600">
                                    Разрешенные пути
                                    <textarea
                                        value={deviceForm.allowedPaths}
                                        onChange={(e) => setDeviceForm({ ...deviceForm, allowedPaths: e.target.value })}
                                        className="mt-1 h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                        placeholder="/*"
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

                                <div className="grid grid-cols-1 gap-2">
                                    <button
                                        type="button"
                                        onClick={saveDeviceConfig}
                                        disabled={savingDevice}
                                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                                    >
                                        Сохранить и применить
                                    </button>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={resetDeviceOverride}
                                            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
                                        >
                                            Сбросить
                                        </button>
                                        <button
                                            type="button"
                                            onClick={deleteSelectedDevice}
                                            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
                                        >
                                            Удалить киоск
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => switchShellMode('kiosk')}
                                            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
                                        >
                                            Включить режим киоска
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => switchShellMode('desktop')}
                                            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
                                        >
                                            Вернуть рабочий стол
                                        </button>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                                        Команды выполняются на самом устройстве через локальный root-helper.
                                        Киоск должен быть онлайн и должен получать команды из Ryaba.
                                    </div>
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </div>

            <HelpModal
                open={helpOpen}
                activeTab={helpTab}
                setActiveTab={setHelpTab}
                onClose={() => setHelpOpen(false)}
            />
        </div>
    );
}
