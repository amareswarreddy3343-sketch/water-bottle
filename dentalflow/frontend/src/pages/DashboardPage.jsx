import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { AppointmentList, UpcomingList, VisitList } from '../components/dashboard/DayLists';
import Icon from '../components/Icon';
import { LoadingBlock } from '../components/ui';
import AppShell from '../layouts/AppShell';
import { canRegister, canSeeCollections, canSeeTodaysMoney } from '../lib/access';
import { fmtLongDate, greeting, money } from '../lib/format';
import { useAuthStore } from '../store/authStore';
import { useClinic, useToday } from '../store/uiStore';

const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

function statTiles(role, s, waiting) {
  const v = (k) => (s ? (s[k] ?? 0) : '–');
  if (role === 'doctor') {
    return [
      { label: 'Waiting now', value: s ? waiting : '–', go: 'visits' },
      { label: 'Appointments today', value: v('today_appointments'), go: 'appointments' },
      { label: 'My patients', value: v('my_patients') },
      { label: 'Treatments I have done', value: v('my_treatments') },
    ];
  }
  if (role === 'master') {
    return [
      { label: 'Visits today', value: v('visits_today'), go: 'visits' },
      { label: 'Appointments today', value: v('today_appointments'), go: 'appointments' },
      { label: 'Registered today', value: v('registered_today') },
      { label: 'Patients', value: v('total_patients'), to: '/patients' },
    ];
  }
  return [
    { label: 'Appointments today', value: v('today_appointments'), go: 'appointments' },
    { label: 'Visits today', value: v('visits_today'), go: 'visits' },
    { label: 'New patients today', value: v('registered_today') },
    { label: 'Waiting for first treatment', value: v('pending_patients'), to: '/patients?tab=new' },
  ];
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const today = useToday();
  const setToday = useClinic((s) => s.setToday);
  const [stats, setStats] = useState(null);
  const [appts, setAppts] = useState(null);
  const [visits, setVisits] = useState(null);
  const [upcoming, setUpcoming] = useState(null);

  const load = useCallback(() => {
    api
      .stats()
      .then((r) => {
        setStats(r.stats);
        setToday(r.stats?.today);
      })
      .catch(() => setStats((s) => s || {}));
    api
      .appointmentsForDay()
      .then((r) => setAppts(r.appointments || []))
      .catch(() => setAppts((a) => a || []));
    api
      .todayVisits()
      .then((r) => setVisits(r.visits || []))
      .catch(() => setVisits((v) => v || []));
    api
      .upcomingAppointments(7)
      .then((r) => setUpcoming(r.appointments || []))
      .catch(() => setUpcoming((u) => u || []));
  }, [setToday]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const firstName = (user?.name || '').replace(/^Dr\.?\s+/i, 'Dr. ');
  const waitingList = (visits || []).filter((v) => !v.seen);
  const seenList = (visits || []).filter((v) => v.seen);
  const tiles = statTiles(role, stats, waitingList.length);
  const showMoney = canSeeTodaysMoney(user);
  const isDoctor = role === 'doctor';

  const appointmentsSection = (
    <section className="section" id="appointments">
      <div className="section-head">
        <h2>
          Today’s appointments
          {appts?.length ? <span className="count">{appts.length}</span> : null}
        </h2>
      </div>
      {appts === null ? <LoadingBlock /> : <AppointmentList items={appts} canCheckIn={canRegister(user)} onChanged={load} />}
    </section>
  );

  const visitsSection = (
    <section className="section" id="visits">
      <div className="section-head">
        <h2>
          {isDoctor ? 'Waiting today' : 'Today’s visits'}
          {visits?.length ? <span className="count">{isDoctor ? waitingList.length : visits.length}</span> : null}
        </h2>
        {canRegister(user) && (
          <Link to="/patients/new?mode=old" className="btn btn-ghost btn-sm">
            <Icon name="checkIn" size={16} />
            Old patient
          </Link>
        )}
      </div>
      {visits === null ? (
        <LoadingBlock />
      ) : isDoctor ? (
        <>
          <VisitList items={waitingList} emptyText={visits.length ? 'Everyone registered today has been seen.' : 'No one is waiting.'} />
          {seenList.length > 0 && (
            <details className="mt-12">
              <summary className="link-btn">Seen today ({seenList.length})</summary>
              <div className="mt-8">
                <VisitList items={seenList} />
              </div>
            </details>
          )}
        </>
      ) : (
        <VisitList items={visits} />
      )}
    </section>
  );

  return (
    <AppShell title="Home">
      <div className="page-head">
        <h1>
          {greeting()}, {firstName}
        </h1>
        <p data-testid="clinic-date">{fmtLongDate(today)}</p>
      </div>

      <form
        className="search-box mb-12"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get('q')?.toString().trim();
          navigate(q ? `/patients?q=${encodeURIComponent(q)}` : '/patients');
        }}
      >
        <Icon name="search" />
        <input className="input" name="q" type="search" placeholder="Find a patient by name, phone or ID" enterKeyHint="search" />
      </form>

      {canRegister(user) && (
        <div className="row mb-12">
          <Link to="/patients/new" className="btn btn-primary grow" style={{ minHeight: 48 }}>
            <Icon name="userPlus" />
            New patient
          </Link>
          <Link to="/patients/new?mode=old" className="btn grow" style={{ minHeight: 48 }}>
            <Icon name="checkIn" />
            Old patient visit
          </Link>
        </div>
      )}

      <div className="stat-grid">
        {tiles.map((t) => {
          const body = (
            <>
              <div className="stat-value">{t.value}</div>
              <div className="stat-label">{t.label}</div>
            </>
          );
          if (t.to) {
            return (
              <Link key={t.label} to={t.to} className="stat">
                {body}
              </Link>
            );
          }
          if (t.go) {
            return (
              <button key={t.label} type="button" className="stat" onClick={() => scrollTo(t.go)}>
                {body}
              </button>
            );
          }
          return (
            <div key={t.label} className="stat">
              {body}
            </div>
          );
        })}
      </div>

      {isDoctor ? (
        <>
          {visitsSection}
          {appointmentsSection}
        </>
      ) : (
        <>
          {appointmentsSection}
          {visitsSection}
        </>
      )}

      {showMoney && (
        <section className="section">
          <div className="section-head">
            <h2>Collected today</h2>
            {canSeeCollections(user) && (
              <Link to="/collections" className="btn btn-ghost btn-sm">
                Details
              </Link>
            )}
          </div>
          <div className="money-row">
            <div>
              <div className="label">Total</div>
              <div className="value money-in">{stats ? money(stats.collected_today) : '–'}</div>
            </div>
            <div>
              <div className="label">Cash</div>
              <div className="value">{stats ? money(stats.collected_today_cash) : '–'}</div>
            </div>
            <div>
              <div className="label">UPI</div>
              <div className="value">{stats ? money(stats.collected_today_upi) : '–'}</div>
            </div>
          </div>
        </section>
      )}

      <section className="section" id="upcoming">
        <div className="section-head">
          <h2>
            Next 7 days
            {upcoming?.length ? <span className="count">{upcoming.length}</span> : null}
          </h2>
        </div>
        {upcoming === null ? <LoadingBlock /> : <UpcomingList items={upcoming} />}
      </section>
    </AppShell>
  );
}
