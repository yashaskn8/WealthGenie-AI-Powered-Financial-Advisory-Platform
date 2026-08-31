import { test, expect, type Page, type Response } from '@playwright/test';

function apiResponse(method: string, pathname: string) {
  return (response: Response) => {
    const url = new URL(response.url());
    return response.request().method() === method && url.pathname === pathname;
  };
}

async function assertNoSensitiveBrowserStorage(page: Page) {
  const storage = await page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
  }));
  const serialized = JSON.stringify(storage);
  expect(serialized).not.toMatch(/wg_token|wg_user|wg_profile|wealthgenie_user_profile/i);
  expect(serialized).not.toMatch(/"token"\s*:|monthly_income|monthly_savings|liquid_savings/i);
}

test.describe('real WealthGenie dependency lifecycle', () => {
  test('signup, profile create/update, recommendation, goal, tax, session restore, login, and logout', async ({ page, context }) => {
    test.setTimeout(180_000);
    const unique = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const user = {
      name: `E2E User ${unique}`,
      // Joi validates public DNS TLDs; example.com is the reserved, valid
      // documentation domain for non-deliverable automated identities.
      email: `e2e-${unique}@example.com`,
      mobile: '9876543210',
      password: 'Valid@Pass2026!',
    };

    await page.goto('/login');
    await page.locator('#login-view a', { hasText: 'Register' }).click();
    await page.locator('#reg-name').fill(user.name);
    await page.locator('#reg-email').fill(user.email);
    await page.locator('#reg-mobile').fill(user.mobile);
    await page.locator('#reg-password').fill(user.password);
    await page.locator('#reg-confirm-password').fill(user.password);

    const registrationPromise = page.waitForResponse(apiResponse('POST', '/api/auth/register'));
    await page.locator('#register-form button[type="submit"]').click();
    const registration = await registrationPromise;
    expect(registration.status()).toBe(201);
    await expect(page.getByRole('heading', { name: 'Registration Successful!' })).toBeVisible();
    await page.locator('.popup-card button', { hasText: 'OK' }).click();
    await expect(page).toHaveURL(/\/profile$/);

    await page.locator('.pf-field', { hasText: 'Monthly Take-Home' }).locator('input').fill('90000');
    await page.locator('.pf-field', { hasText: 'Monthly Savings Capacity' }).locator('input').fill('25000');
    await page.locator('.pf-field', { hasText: 'Age' }).locator('input').fill('34');
    await page.locator('.pf-field', { hasText: 'Liquid Savings' }).locator('input').fill('300000');
    await page.locator('.pf-field', { hasText: 'Emergency Fund (Months)' }).locator('input').fill('6');

    const profileCreatePromise = page.waitForResponse(apiResponse('POST', '/api/profile/build'));
    const recommendationPromise = page.waitForResponse(apiResponse('POST', '/api/recommend'), { timeout: 90_000 });
    await page.locator('button.btn-save-continue').click();

    const profileCreate = await profileCreatePromise;
    expect(profileCreate.status()).toBe(201);
    const profile = await profileCreate.json();
    expect(profile.profileId).toMatch(/^[0-9a-f]{24}$/i);

    const recommendation = await recommendationPromise;
    expect(recommendation.status()).toBe(200);
    const advisory = await recommendation.json();
    expect(String(advisory.recommendationId)).toMatch(/^[0-9a-f]{24}$/i);
    expect(String(advisory.audit_id)).toMatch(/^[0-9a-f]{24}$/i);
    expect(advisory.instruments.length).toBeGreaterThan(0);
    await expect(page.locator('aside.sidebar')).toBeVisible();

    await page.getByTestId('nav-profile').click();
    await page.getByTestId('profile-edit').click();
    await page.getByTestId('profile-input-monthly_savings').fill('27000');
    const profileUpdatePromise = page.waitForResponse(apiResponse('PUT', `/api/profile/${profile.profileId}`));
    await page.getByTestId('profile-save').click();
    const profileUpdate = await profileUpdatePromise;
    expect(profileUpdate.status()).toBe(200);
    const updatedProfile = await profileUpdate.json();
    expect(updatedProfile.monthly_savings).toBe(27000);
    await expect(page.getByText('Profile updated successfully!')).toBeVisible();

    await page.getByTestId('nav-goal-planner').click();
    await page.getByRole('button', { name: /Create Target Goal/ }).click();
    await expect(page.getByTestId('goal-form')).toBeVisible();
    await page.getByRole('button', { name: /Emergency Fund/ }).click();
    await page.getByTestId('goal-target-amount').fill('600000');
    const targetYear = new Date().getUTCFullYear() + 4;
    await page.getByTestId('goal-target-date').fill(`${targetYear}-12-31`);
    await page.getByRole('button', { name: 'Next Step' }).click();
    await page.getByTestId('goal-current-savings').fill('100000');

    const goalCreatePromise = page.waitForResponse(apiResponse('POST', '/api/goals/create'), { timeout: 90_000 });
    await page.getByTestId('goal-submit').click();
    const goalCreate = await goalCreatePromise;
    expect(goalCreate.status()).toBe(201);
    const goal = await goalCreate.json();
    expect(String(goal.goal.goalId)).toMatch(/^[0-9a-f]{24}$/i);
    await expect(page.getByText('Emergency Fund').first()).toBeVisible();

    const taxPromise = page.waitForResponse(response => {
      const url = new URL(response.url());
      return response.request().method() === 'GET' && url.pathname === '/api/tax/compare';
    });
    await page.getByTestId('nav-tax-optimizer').click();
    const taxResponse = await taxPromise;
    expect(taxResponse.status()).toBe(200);
    const tax = await taxResponse.json();
    expect(tax.new_regime.tax).toBeGreaterThanOrEqual(0);
    expect(tax.old_regime.tax).toBeGreaterThanOrEqual(0);
    await expect(page.getByText('Total Income Tax')).toBeVisible();

    const cookies = await context.cookies();
    expect(cookies.find(cookie => cookie.name === 'wg_session')).toMatchObject({ httpOnly: true });
    await assertNoSensitiveBrowserStorage(page);

    const sessionRestorePromise = page.waitForResponse(apiResponse('GET', '/api/auth/session'));
    await page.reload();
    const restored = await sessionRestorePromise;
    expect(restored.status()).toBe(200);
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 45_000 });
    await assertNoSensitiveBrowserStorage(page);

    const firstLogoutPromise = page.waitForResponse(apiResponse('POST', '/api/auth/logout'));
    await page.getByTestId('nav-sign-out').click();
    expect((await firstLogoutPromise).status()).toBe(200);
    await expect(page).toHaveURL(/\/login$/);

    await page.locator('#login-email').fill(user.email);
    await page.locator('#login-password').fill(user.password);
    const loginPromise = page.waitForResponse(apiResponse('POST', '/api/auth/login'));
    await page.locator('#login-form button[type="submit"]').click();
    expect((await loginPromise).status()).toBe(200);
    await expect(page.locator('aside.sidebar')).toBeVisible({ timeout: 45_000 });

    const finalLogoutPromise = page.waitForResponse(apiResponse('POST', '/api/auth/logout'));
    await page.getByTestId('nav-sign-out').click();
    expect((await finalLogoutPromise).status()).toBe(200);
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.cookies()).some(cookie => cookie.name === 'wg_session')).toBe(false);
    await assertNoSensitiveBrowserStorage(page);
  });
});
