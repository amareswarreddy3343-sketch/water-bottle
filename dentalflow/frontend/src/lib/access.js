/** Who can do what (the server checks the same rules) */
export const isClinician = (u) => u?.role === 'doctor' || u?.role === 'master';

/** New patients and today's visits are registered at reception (and by the admin) */
export const canRegister = (u) => u?.role === 'receptionist' || u?.role === 'master';

/** Collections report: the admin, and doctors the admin has allowed */
export const canSeeCollections = (u) => u?.role === 'master' || (u?.role === 'doctor' && Boolean(u?.can_view_collections));

/** Today's money on the dashboard: also reception (they take the payments) */
export const canSeeTodaysMoney = (u) => u?.role === 'receptionist' || canSeeCollections(u);
