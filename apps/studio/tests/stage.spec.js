import { expect, test } from '@playwright/test';

// Several actors on one stage: enter, look, shots, `on:` targeting and click-to-select.
test('the Ensemble demo: three actors, shots, looks and on: targeting', async ({ page }) => {
  await page.goto('/?capture');
  await page.waitForFunction(() => window.Studio);
  await page.selectOption('#demo', { label: 'Ensemble' });
  await expect(page.locator('#scoreFile')).toHaveText(/ensemble\.score$/);

  const at = (bar, beat) => page.evaluate(([b, n]) => {
    const S = window.Studio, C = S.conductor; C.seek(C.timeOf([b, n])); S.step(0.04);
    const st = S.stage;
    return {
      cast: st.members.map((m) => m.id), shot: st.shotSpec,
      looks: Object.fromEntries(st.members.map((m) => [m.id, m.lookAt])),
      poses: Object.fromEntries(st.members.map((m) => [m.id, m.actor.poseName]))
    };
  }, [bar, beat]);

  const bar2 = await at(2, 3.5);
  expect(bar2.cast).toEqual(['max', 'kid']);
  expect(bar2.looks).toEqual({ max: 'kid', kid: 'max' });
  expect(bar2.poses.kid).toBe('feel-happy');            // `on: 'kid'` went to the kid...
  expect(bar2.poses.max).toBe('wave');                  // ...and not to Max

  expect((await at(3, 3)).shot).toEqual({ frame: 'close', on: 'kid' });
  const bar6 = await at(6, 3.5);
  expect(bar6.cast).toEqual(['max', 'kid', 'boss']);
  expect(bar6.poses.boss).toBe('fedup');

  // seeking backwards rebuilds the cast exactly
  expect((await at(1, 3)).cast).toEqual(['max']);
});

test('clicking an actor makes the panels edit it', async ({ page }) => {
  await page.goto('/?capture');
  await page.waitForFunction(() => window.Studio);
  await page.click('#bFree');
  await page.selectOption('#demo', { label: 'Ensemble' });
  // let layout settle (a resize clears and rescales the canvas) before measuring where actors are
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const box = await page.evaluate(() => {
    const S = window.Studio, C = S.conductor; C.seek(C.timeOf([6, 3.5])); S.step(0.04);
    const kid = S.stage.S.actors.find((A) => A.F.who === 'child').body, r = document.querySelector('#main').getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 1.5);
    return { x: r.left + kid.cx / dpr, y: r.top + kid.cy / dpr };
  });
  await page.mouse.click(box.x, box.y);
  expect(await page.evaluate(() => window.Studio.state.selected)).toBe('kid');
  await expect(page.locator('#toast')).toHaveText(/now edit kid/);
});

test('the editor warns about an actor who never entered', async ({ page }) => {
  await page.goto('/?capture');
  await page.waitForFunction(() => window.Studio);
  await page.selectOption('#demo', { label: 'Ensemble' });
  await page.evaluate(() => window.Studio.setScore(document.querySelector('#scoreEdit').value.replace("{ at: [1, 2], pose: 'wave' },", "{ at: [1, 2], pose: 'wave', on: 'ghost' },")));
  await expect(page.locator('#scoreStatus')).toHaveText(/nobody called 'ghost' has entered/);
});
