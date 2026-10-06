import { test, expect, type Page, type Locator } from '@playwright/test'

const node = (page: Page, id: string) => page.locator(`.nn-node[data-node-id="${id}"]`)
const connections = (page: Page) => page.locator('.nn-connections-layer [data-connection-id]')
const port = (page: Page, nodeId: string, portId: string) =>
  page.locator(`.nn-port-circle[data-node-id="${nodeId}"][data-port-id="${portId}"]`)
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

async function box(l: Locator) {
  const b = await l.boundingBox()
  if (!b) throw new Error('no bounding box')
  return b
}

async function center(l: Locator) {
  const b = await box(l)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 })
  await page.mouse.move(to.x, to.y, { steps: 5 })
  await page.mouse.up()
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

async function nodeBoxes(page: Page) {
  const nodes = page.locator('.nn-node')
  const out: Array<{ id: string; x: number; y: number; width: number; height: number }> = []
  for (let i = 0; i < await nodes.count(); i++) {
    const n = nodes.nth(i)
    out.push({ id: (await n.getAttribute('data-node-id'))!, ...(await box(n)) })
  }
  return out
}

async function expectNoOverlap(page: Page) {
  const boxes = await nodeBoxes(page)
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    expect(overlaps(boxes[i], boxes[j]), `${boxes[i].id} overlaps ${boxes[j].id}`).toBe(false)
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.nn-node')).toHaveCount(8)
})

test('opens with 8 laid-out, non-overlapping nodes; auto-layout keeps them apart', async ({ page }) => {
  await expect(connections(page)).toHaveCount(7)
  await expectNoOverlap(page)
  // every node is inside the visible canvas (fitView)
  const canvas = await box(page.locator('.nn-canvas'))
  for (const b of await nodeBoxes(page)) {
    expect(b.x).toBeGreaterThanOrEqual(canvas.x)
    expect(b.y).toBeGreaterThanOrEqual(canvas.y)
    expect(b.x + b.width).toBeLessThanOrEqual(canvas.x + canvas.width)
    expect(b.y + b.height).toBeLessThanOrEqual(canvas.y + canvas.height)
  }
  // scramble a node onto another, then auto-layout
  await drag(page, await center(node(page, 'out').locator('.nn-node-header')), await center(node(page, 'merge').locator('.nn-node-header')))
  await page.getByRole('button', { name: 'Auto layout' }).click()
  await expectNoOverlap(page)
})

test('dragging from an output to an input creates a connection; Cmd/Ctrl+Z undoes, redo restores', async ({ page }) => {
  await drag(page, await center(port(page, 'srcA', 'out')), await center(port(page, 'stepB2', 'in')))
  await expect(connections(page)).toHaveCount(8)

  await page.locator('.nn-canvas').focus()
  await page.keyboard.press(`${mod}+z`)
  await expect(connections(page)).toHaveCount(7)
  await page.keyboard.press(`${mod}+Shift+z`)
  await expect(connections(page)).toHaveCount(8)
})

test('dragging a node is undone in one step', async ({ page }) => {
  const header = node(page, 'merge').locator('.nn-node-header')
  const before = await box(node(page, 'merge'))
  const start = await center(header)
  await drag(page, start, { x: start.x + 120, y: start.y + 90 })
  const moved = await box(node(page, 'merge'))
  expect(Math.abs(moved.x - before.x)).toBeGreaterThan(50)

  await page.keyboard.press(`${mod}+z`) // canvas got focus from the click
  await expect.poll(async () => (await box(node(page, 'merge'))).x).toBeCloseTo(before.x, 0)
  expect((await box(node(page, 'merge'))).y).toBeCloseTo(before.y, 0)
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  // one step: the next undo has nothing from the drag left — redo brings the drag back
  await page.keyboard.press(`${mod}+Shift+z`)
  await expect.poll(async () => (await box(node(page, 'merge'))).x).toBeCloseTo(moved.x, 0)
})

test('group frame encloses its members; dragging its label moves all of them', async ({ page }) => {
  const frame = page.locator('.nn-group[data-group-id="alice"]')
  const members = ['srcA', 'stepA1', 'stepA2']
  const f = await box(frame)
  for (const id of members) {
    const b = await box(node(page, id))
    expect(b.x).toBeGreaterThan(f.x)
    expect(b.y).toBeGreaterThan(f.y)
    expect(b.x + b.width).toBeLessThan(f.x + f.width)
    expect(b.y + b.height).toBeLessThan(f.y + f.height)
  }

  const before = await Promise.all(members.map(id => box(node(page, id))))
  const others = await box(node(page, 'srcB'))
  const label = frame.locator('.nn-group-label')
  const start = await center(label)
  await drag(page, start, { x: start.x + 60, y: start.y - 40 })
  const after = await Promise.all(members.map(id => box(node(page, id))))
  for (let i = 0; i < members.length; i++) {
    expect(after[i].x - before[i].x).toBeCloseTo(after[0].x - before[0].x, 0)
    expect(after[i].y - before[i].y).toBeCloseTo(after[0].y - before[0].y, 0)
  }
  expect(after[0].x - before[0].x).toBeGreaterThan(20)
  expect(await box(node(page, 'srcB'))).toEqual(others)
  // members are selected
  for (const id of members) await expect(node(page, id)).toHaveClass(/nn-node-selected/)

  // the whole group drag is one undo step
  await page.keyboard.press(`${mod}+z`)
  await expect.poll(async () => (await box(node(page, 'stepA2'))).x).toBeCloseTo(before[2].x, 0)
  expect((await box(node(page, 'srcA'))).x).toBeCloseTo(before[0].x, 0)
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
})

test('clicking a node shows its name in the inspector; editing the name updates the header', async ({ page }) => {
  await node(page, 'stepA1').locator('.nn-node-header').click()
  const name = page.locator('.nn-inspector .nn-inspector-input').first()
  await expect(name).toHaveValue('Alice persona')
  await name.fill('Alice voice')
  await expect(node(page, 'stepA1').locator('.nn-node-name')).toHaveText('Alice voice')
  // custom inspector component of the prototype is rendered
  await expect(page.getByTestId('step-text')).toBeVisible()
})

test('Delete removes the selected node with its connections', async ({ page }) => {
  await node(page, 'merge').locator('.nn-node-header').click()
  await page.keyboard.press('Delete')
  await expect(page.locator('.nn-node')).toHaveCount(7)
  await expect(node(page, 'merge')).toHaveCount(0)
  await expect(connections(page)).toHaveCount(4) // c3, c6, c7 were attached to merge
})

test('host theme tokens (--nr-*) restyle the editor; without them — the old look', async ({ page }) => {
  const canvas = page.locator('.nn-canvas')
  const bg = () => canvas.evaluate(el => getComputedStyle(el).backgroundColor)
  const nodeBg = () => node(page, 'merge').evaluate(el => getComputedStyle(el).backgroundColor)
  // No tokens on the page: the editor's own fallback colours.
  expect(await bg()).toBe('rgb(26, 26, 46)')
  expect(await nodeBg()).toBe('rgb(37, 37, 53)')
  const theme = page.getByTestId('demo-theme')
  await theme.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await bg()).toBe('rgb(246, 239, 227)')
  expect(await nodeBg()).toBe('rgb(239, 230, 216)')
  await theme.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await bg()).toBe('rgb(23, 19, 16)')
  await theme.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'none')
  expect(await bg()).toBe('rgb(26, 26, 46)')
})
