import { chromium, expect, test } from '@playwright/test'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('the extension accepts Flow text for only the attached form and releases the lock on disconnect', async ({ baseURL }) => {
  const directory = await mkdtemp(join(tmpdir(), 'munshi-extension-test-'))
  try {
    await cp(resolve('extension/dist'), directory, { recursive: true })
    const manifestPath = join(directory, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    expect(manifest.permissions).toEqual(['sidePanel', 'activeTab', 'scripting'])
    expect(manifest.host_permissions).toBeUndefined()
    // The fixture grant represents the toolbar gesture in the automated browser.
    manifest.host_permissions = ['http://127.0.0.1/*']
    await writeFile(manifestPath, JSON.stringify(manifest))
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: ['--disable-extensions-except=' + directory, '--load-extension=' + directory],
    })
    try {
      const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker')
      const extensionId = new URL(worker.url()).hostname
      const fixture = context.pages()[0]
      const url = baseURL + '/extension-fixture'
      await fixture.route(url, route => route.fulfill({
        contentType: 'text/html',
        body: `<title>Active form fixture</title>
          <form id="search"><label>Find<input name="q"></label><button>Find</button></form>
          <form id="application"><label>Applicant name<input required name="applicantName"></label>
          <label>PIN code<input required name="pincode"></label><button>Submit</button></form>`,
      }))
      await fixture.goto(url)
      const panel = await context.newPage()
      await panel.addInitScript(() => {
        Object.defineProperty(window, 'speechSynthesis', { value: {
          getVoices: () => [], cancel: () => {},
          speak: (utterance: SpeechSynthesisUtterance) => setTimeout(() => utterance.dispatchEvent(new Event('end')), 35),
        } })
      })
      await panel.goto('chrome-extension://' + extensionId + '/panel.html')
      await fixture.bringToFront()
      await panel.getByRole('button', { name: 'Connect to this tab' }).dispatchEvent('click')
      await expect(panel.getByText('Connected to this tab. Start with speech or text.')).toBeVisible()

      await panel.getByRole('button', { name: 'Ask next question' }).dispatchEvent('click')
      await expect(panel.getByText('आपका पूरा नाम क्या है?')).toBeVisible()
      await panel.getByRole('button', { name: 'Dictate with Wispr Flow' }).dispatchEvent('click')
      await panel.getByLabel('Dictation or typed utterance').evaluate(input => {
        const clipboardData = new DataTransfer()
        clipboardData.setData('text/plain', 'Meera Devi')
        input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }))
      })
      await expect(panel.getByText('Wispr Flow input', { exact: true })).toBeVisible()
      await expect(fixture.locator('[name=applicantName]')).toHaveValue('Meera Devi')
      await panel.getByRole('button', { name: 'Ask next question' }).dispatchEvent('click')
      await panel.getByLabel('Dictation or typed utterance').fill('aath double zero double zero ek')
      await panel.getByRole('button', { name: 'Send', exact: true }).dispatchEvent('click')
      await expect(fixture.locator('[name=pincode]')).toHaveValue('800001')
      await expect(fixture.locator('#search button')).toBeEnabled()
      const submit = fixture.locator('#application button')
      await expect(submit).toBeDisabled()
      await panel.getByRole('button', { name: 'Read back' }).dispatchEvent('click')
      await expect(panel.getByRole('button', { name: 'Confirm read-back' })).toBeVisible()
      await panel.getByRole('button', { name: 'Confirm read-back' }).dispatchEvent('click')
      await expect(submit).toBeEnabled()
      await fixture.locator('[name=pincode]').fill('800002')
      await expect(submit).toBeDisabled()
      await panel.close()
      await expect(submit).toBeEnabled()
    } finally {
      await context.close()
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
