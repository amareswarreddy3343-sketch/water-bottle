export const MIN_PASSWORD = 6;

/** Problem with a new password + its confirmation, or '' */
export function newPasswordProblem(password, confirm) {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (confirm !== password) return 'The two passwords don’t match.';
  return '';
}
