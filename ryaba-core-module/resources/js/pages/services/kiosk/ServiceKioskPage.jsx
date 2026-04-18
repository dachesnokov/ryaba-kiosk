import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const emptyProfile = {
    name: 'Основной профиль',
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
    }[tone];

    return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${cls}`}>{children}</span>;
}

function statusTone(status, lastSeenAt) {
    if (status === 'pending') return 'yellow';
    if (!lastSeenAt) return 'red';

    const diff = Date.now() - new Date(lastSeenAt).getTime();
    if (diff > 2 * 60 * 1000) return 'red';

    return status === 'online' ? 'green' : 'slate';
}

export default function ServiceKioskPage() {
    const [dashboard, setDashboard] = useState(null);
    const [devices, setDevices] = useState([]);
    const [profiles, setProfiles] = useState([]);
    const [profileForm, setProfileForm] = useState(emptyProfile);
    const [tokenName, setTokenName] = useState('Регистрация киосков');
    const [plainToken, setPlainToken] = useState('');
    const [loading, setLoading] = useState(true);

    async function load() {
        setLoading(true);
        const [dash, devs, profs] = await Promise.all([
            axios.get('/api/admin/services/kiosks/dashboard'),
            axios.get('/api/admin/services/kiosks/devices'),
            axios.get('/api/admin/services/kiosks/profiles'),
        ]);

        setDashboard(dash.data);
        setDevices(devs.data.data || []);
        setProfiles(profs.data.data || []);
        setLoading(false);
    }

    useEffect(() => {
        load();
        const timer = setInterval(load, 15000);
        return () => clearInterval(timer);
    }, []);

    async function saveProfile() {
        await axios.post('/api/admin/services/kiosks/profiles', profileForm);
        setProfileForm(emptyProfile);
        await load();
    }

    async function createToken() {
        const { data } = await axios.post('/api/admin/services/kiosks/enrollment-tokens', {
            name: tokenName,
            profile_id: profiles[0]?.id || null,
            max_uses: 50,
        });
        setPlainToken(data.plain_token);
    }

    async function approve(device) {
        await axios.post(`/api/admin/services/kiosks/devices/${device.id}/approve`);
        await load();
    }

    async function command(device, type) {
        await axios.post(`/api/admin/services/kiosks/devices/${device.id}/command`, { type, payload: {} });
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
                    <button onClick={load} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                        Обновить
                    </button>
                </div>

                <div className="grid grid-cols-4 gap-4">
                    {stats.map(([label, value]) => (
                        <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="text-sm text-slate-500">{label}</div>
                            <div className="mt-2 text-3xl font-bold">{value}</div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-3 gap-5">
                    <section className="col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
                                        <th className="px-3 py-3">Версия</th>
                                        <th className="px-3 py-3">Последняя связь</th>
                                        <th className="px-3 py-3"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {devices.map((device) => (
                                        <tr key={device.id}>
                                            <td className="px-3 py-3">
                                                <div className="font-semibold">{device.name || device.hostname || 'Киоск'}</div>
                                                <div className="text-xs text-slate-500">{device.profile?.name || 'Профиль не назначен'}</div>
                                            </td>
                                            <td className="px-3 py-3">
                                                <Badge tone={statusTone(device.status, device.last_seen_at)}>{device.status}</Badge>
                                            </td>
                                            <td className="px-3 py-3">{device.ip_address || '—'}</td>
                                            <td className="px-3 py-3">{device.app_version || '—'}</td>
                                            <td className="px-3 py-3">{device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : '—'}</td>
                                            <td className="px-3 py-3">
                                                <div className="flex gap-2">
                                                    {device.status === 'pending' ? (
                                                        <button onClick={() => approve(device)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
                                                            Принять
                                                        </button>
                                                    ) : null}
                                                    <button onClick={() => command(device, 'reload')} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                                                        Обновить
                                                    </button>
                                                    <button onClick={() => command(device, 'go_home')} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
                                                        Домой
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

                    <aside className="flex flex-col gap-5">
                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                            <h2 className="text-xl font-bold">Токен регистрации</h2>
                            <input
                                value={tokenName}
                                onChange={(e) => setTokenName(e.target.value)}
                                className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                placeholder="Название токена"
                            />
                            <button onClick={createToken} className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                                Создать токен
                            </button>
                            {plainToken ? (
                                <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                                    <div className="font-bold">Сохраните токен сейчас:</div>
                                    <code className="mt-2 block break-all">{plainToken}</code>
                                </div>
                            ) : null}
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
                                onChange={(e) => setProfileForm({
                                    ...profileForm,
                                    home_url: e.target.value,
                                    allowed_origins: [new URL(e.target.value).origin],
                                })}
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
