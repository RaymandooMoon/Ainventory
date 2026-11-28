import { expect, test } from '@playwright/test';

test.describe('APPLE 10 Neon 3D / Paper 2D minigame (/minigame)', () => {
  test('renders /minigame title overlay, starts 3D WebGL board, handles drag selection, hint, soft tint, and reset without errors', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.goto('/minigame', { waitUntil: 'domcontentloaded' });

    const root = page.getByTestId('fruitbox-minigame-root');
    await expect(root).toBeVisible();

    const playBtn = page.getByTestId('mg-play-btn');
    await expect(playBtn).toBeVisible();

    // Switch visual style to Paper 2D and back to Neon 3D cleanly
    await page.getByRole('radio', { name: /페이퍼 2D/ }).click();
    await expect(root).toHaveClass(/is-paper-2d/);
    await page.getByRole('radio', { name: /네온 3D/ }).click();
    await expect(root).not.toHaveClass(/is-paper-2d/);

    // Switch mode to Fever and back to Classic
    await page.getByRole('radio', { name: /피버 3D/ }).click();
    await page.getByRole('radio', { name: /클래식/ }).click();

    await playBtn.click();
    await expect(playBtn).toBeHidden();

    // Canvas should be mounted and full-sized
    const canvas = page.locator('canvas.mg-stage-canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(240);
    expect(box!.height).toBeGreaterThan(240);

    // Timer starts ticking below 02:00
    const timer = page.getByTestId('mg-timer');
    await expect(timer).toHaveText(/0[12]:\d{2}/);

    // Drag across a horizontal slice of apples and ensure the HUD sum updates
    const startX = box!.x + box!.width * 0.25;
    const startY = box!.y + box!.height * 0.45;
    const endX = box!.x + box!.width * 0.65;
    const endY = box!.y + box!.height * 0.55;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 8 });
    await expect(page.getByTestId('mg-sum-pill')).toContainText(/SUM \d+/);
    await page.mouse.up();

    // Toggle to Paper 2D mid-game and verify drag works on the 2D canvas too
    await page.getByRole('button', { name: /2D 페이퍼 전환|3D 네온 전환/ }).click();
    await expect(root).toHaveClass(/is-paper-2d/);
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 6 });
    await expect(page.getByTestId('mg-sum-pill')).toContainText(/SUM \d+/);
    await page.mouse.up();

    // Hint, Soft Tint, and Reset controls remain responsive
    await page.getByRole('button', { name: '힌트 보기' }).click();
    await page.getByRole('button', { name: '연한 색 모드 전환' }).click();
    await page.getByRole('button', { name: '새 판 시작' }).click();

    await expect(page.getByTestId('mg-score')).toHaveText('0');
    expect(pageErrors).toEqual([]);
  });
});
