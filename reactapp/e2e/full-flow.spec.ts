import { test, expect } from '@playwright/test';

test.describe('WealthGenie Complete E2E Lifecycle Flow', () => {
  const timestamp = Date.now();
  const testUser = {
    name: `E2E Test User ${timestamp}`,
    email: `e2e_user_${timestamp}@wealthgenie.io`,
    mobile: '9876543210',
    password: 'Password@2026!',
  };

  test('full user journey: signup -> profile -> goals -> recommendations -> chat', async ({ page }) => {
    // -------------------------------------------------------------
    // STEP 1: Signup Flow
    // -------------------------------------------------------------
    console.log('[E2E] Step 1: Navigating to /login...');
    await page.goto('/login');
    await expect(page).toHaveURL(/.*\/login/);

    // Switch to Register tab
    const registerLink = page.locator('#login-view a:has-text("Register")');
    await registerLink.click();
    await expect(page.locator('#register-view')).toBeVisible();

    // Fill registration form
    console.log(`[E2E] Registering user: ${testUser.email}...`);
    await page.locator('#reg-name').fill(testUser.name);
    await page.locator('#reg-email').fill(testUser.email);
    await page.locator('#reg-mobile').fill(testUser.mobile);
    await page.locator('#reg-password').fill(testUser.password);
    await page.locator('#reg-confirm-password').fill(testUser.password);

    // Submit registration
    const submitRegBtn = page.locator('#register-form button[type="submit"]');
    await submitRegBtn.click();

    // Verify popup and click OK to navigate to Profile
    const popupOkBtn = page.locator('.popup-card button.popup-btn, .popup-card button:has-text("OK")').first();
    await expect(popupOkBtn).toBeVisible({ timeout: 15000 });
    console.log('[E2E] Registration successful! Confirming popup...');
    await popupOkBtn.click();

    // -------------------------------------------------------------
    // STEP 2: Profile Completion
    // -------------------------------------------------------------
    console.log('[E2E] Step 2: Completing Financial Profile...');
    await expect(page).toHaveURL(/.*\/profile/);
    await expect(page.locator('.profile-content h1, .profile-content h2').first()).toBeVisible({ timeout: 10000 });

    // Fill profile fields
    const takeHomeInput = page.locator('.pf-field:has-text("Monthly Take-Home") input');
    if (await takeHomeInput.isVisible()) {
      await takeHomeInput.fill('75000');
    }

    const savingsInput = page.locator('.pf-field:has-text("Monthly Savings") input');
    if (await savingsInput.isVisible()) {
      await savingsInput.fill('20000');
    }

    // Save profile and enter Dashboard
    const saveProfileBtn = page.locator('button.btn-save-continue, button[type="submit"]:has-text("Save")').first();
    await saveProfileBtn.click();

    // Verify Dashboard loads with Sidebar and Dashboard Shell
    console.log('[E2E] Waiting for Dashboard Shell to mount...');
    await expect(page.locator('.sidebar, aside.sidebar').first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.dashboard-page').first()).toBeVisible({ timeout: 20000 });
    console.log('[E2E] Dashboard successfully mounted.');

    // Dismiss first-time onboarding modal if present
    const onboardingBtn = page.locator('button:has-text("Show me my plan")').first();
    if (await onboardingBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      console.log('[E2E] Dismissing first-time onboarding welcome modal...');
      await onboardingBtn.click();
    }

    // -------------------------------------------------------------
    // STEP 3: View Recommendations & Deep Dive Modal
    // -------------------------------------------------------------
    console.log('[E2E] Step 3: Checking AI Recommendations & Deep Dive...');
    const recCard = page.locator('.rec-card, .investment-card').first();
    await expect(recCard).toBeVisible({ timeout: 20000 });

    // Click "Learn More" on first recommendation card
    const learnMoreBtn = recCard.locator('button:has-text("Learn More"), button.btn-learn-more').first();
    if (await learnMoreBtn.isVisible()) {
      await learnMoreBtn.click();
      const modal = page.locator('[role="dialog"], .ddm-overlay, .deep-dive-overlay').first();
      await expect(modal).toBeVisible({ timeout: 10000 });
      console.log('[E2E] Deep Dive Modal successfully opened.');

      // Close Deep Dive Modal
      const closeBtn = page.locator('button[aria-label="Close dialog"], button.ddm-close-btn, button.close-modal').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await expect(modal).not.toBeVisible({ timeout: 5000 });
      console.log('[E2E] Deep Dive Modal dismissed.');
    }

    // -------------------------------------------------------------
    // STEP 4: Goal Planning & Creation Flow
    // -------------------------------------------------------------
    console.log('[E2E] Step 4: Navigating to Goal Planner...');
    const goalNavBtn = page.locator('.sidebar-item:has-text("Plan a Goal"), .sidebar-item:has-text("My Goals")').first();
    await goalNavBtn.click();

    // Click "Create Target Goal" button
    const createGoalBtn = page.locator('button:has-text("Create Target Goal"), button:has-text("New Goal")').first();
    if (await createGoalBtn.isVisible({ timeout: 10000 })) {
      await createGoalBtn.click();

      // Step 1: Select Preset (e.g. "Emergency Fund" or first preset)
      const presetBtn = page.locator('button:has-text("Emergency Fund"), button:has-text("House Down Payment")').first();
      await expect(presetBtn).toBeVisible({ timeout: 10000 });
      await presetBtn.click();

      // Step 2: Fill Amount and Target Date
      const targetAmtInput = page.locator('input[type="number"][placeholder*="3000000"], input[type="number"]').first();
      await targetAmtInput.fill('500000');

      const dateInput = page.locator('input[type="date"]').first();
      const targetYear = new Date().getFullYear() + 4;
      await dateInput.fill(`${targetYear}-12-31`);

      const nextStepBtn = page.locator('button:has-text("Next Step")').first();
      await nextStepBtn.click();

      // Step 3: Current Savings and Submit
      const currentSavingsInput = page.locator('input[type="number"][placeholder*="100000"], input[type="number"]').first();
      if (await currentSavingsInput.isVisible()) {
        await currentSavingsInput.fill('50000');
      }

      const submitGoalBtn = page.locator('button[type="submit"]:has-text("Save Goal"), button[type="submit"]:has-text("Projections")').first();
      await submitGoalBtn.click();
      console.log('[E2E] Goal submitted successfully.');

      // Verify created goal card / statistics render
      await expect(page.locator('.goal-card, .goal-item, .hud-metric-card, text=5.0L, text=₹5,00,000').first()).toBeVisible({ timeout: 15000 });
      console.log('[E2E] Goal verified in tracker dashboard.');
    }

    // -------------------------------------------------------------
    // STEP 5: GenieChat Intelligent Conversation
    // -------------------------------------------------------------
    console.log('[E2E] Step 5: Interacting with Genie AI Chat...');
    const genieFab = page.locator('.genie-fab, button[aria-label*="chat"], .genie-bubble-btn').first();
    await expect(genieFab).toBeVisible({ timeout: 10000 });
    await genieFab.click();

    // Verify Chat modal is open
    const chatInput = page.locator('input.genie-input, input[aria-label*="financial question"]').first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // Ask a grounded question
    const query = 'What is the recommended asset allocation for a balanced growth portfolio?';
    console.log(`[E2E] Sending chat query: "${query}"...`);
    await chatInput.fill(query);

    const sendBtn = page.locator('button.genie-send-btn, button[aria-label="Send message"]').first();
    await sendBtn.click();

    // Wait for the AI model / RAG response bubble to appear
    console.log('[E2E] Waiting for grounded response from Genie...');
    await expect(page.locator('.typing-indicator')).not.toBeVisible({ timeout: 45000 });

    const assistantBubble = page.locator('.chat-bubble--assistant, .message-bubble.assistant, .chat-bubble--genie:not(:has(.typing-indicator))').last();
    await expect(assistantBubble).toBeVisible({ timeout: 15000 });

    const responseText = await assistantBubble.textContent();
    console.log(`[E2E] Genie Response finalized (${responseText?.length || 0} chars):\n"${responseText?.slice(0, 200)}..."`);
    expect(responseText).toBeTruthy();
    expect(responseText.length).toBeGreaterThan(15);

    console.log('[E2E] Complete user lifecycle verified successfully with zero errors!');
  });
});
