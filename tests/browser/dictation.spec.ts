import { expect, test, type Page } from '@playwright/test'

const compose = (page: Page) => page.getByLabel('Dictation or typed utterance')

async function paste(page: Page, value: string) {
  await page.evaluate(text => navigator.clipboard.writeText(text), value)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V')
}

async function setup(page: Page) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        getVoices: () => [],
        cancel: () => {},
        speak: (utterance: SpeechSynthesisUtterance) => setTimeout(() => {
          utterance.dispatchEvent(new Event('end'))
        }, 35),
      },
    })
  })
  await page.goto('/')
}

test('a focused Flow paste runs the pension workflow through the submission receipt', async ({ page }) => {
  await setup(page)
  const now = new Date()
  const age = now.getFullYear() - 1962 - Number(now.getMonth() < 7 || (now.getMonth() === 7 && now.getDate() < 15))
  const submit = page.getByRole('button', { name: 'Submit practice form' })
  const name = page.locator('[name=applicantName]')
  const otp = page.locator('[name=otp]')

  await expect(submit).toBeDisabled()
  await page.getByRole('button', { name: 'Dictate with Wispr Flow' }).click()
  await expect(compose(page)).toBeFocused()
  await paste(page, `My name is Ramdhari Yadav. I am ${age - 2} years old.`)
  await expect(name).toHaveValue('Ramdhari Yadav')
  await expect(page.locator('[name=age]')).toHaveValue(String(age - 2))
  await expect(page.getByText('Wispr Flow input', { exact: true })).toBeVisible()
  await expect(compose(page)).toHaveValue('')

  await paste(page, `Sorry, make that ${age}.`)
  await expect(page.locator('[name=age]')).toHaveValue(String(age))
  await expect(page.locator('.token-replacement')).toHaveText(String(age))

  await paste(page, '1. Date of birth: 15 August 1962.\n2. PIN code: 800 002.')
  await expect(page.locator('[name=dob]')).toHaveValue('1962-08-15')
  await expect(page.locator('[name=pincode]')).toHaveValue('800002')
  await expect(page.getByText('Manual step', { exact: true })).toBeVisible()

  await paste(page, 'OTP 246810.')
  await expect(otp).toHaveValue('')
  await expect(submit).toBeDisabled()
  await otp.fill('246810')
  await page.getByRole('button', { name: 'Focus Wispr Flow input' }).click()
  await paste(page, 'Aage badho.')
  await paste(page, 'Please read it back.')
  await expect(page.getByRole('button', { name: 'Confirm read-back' })).toBeVisible()
  await paste(page, 'Nahi, pincode 800001.')
  await expect(page.locator('[name=pincode]')).toHaveValue('800001')
  await expect(page.locator('.token-replaced')).toContainText('800002')
  await expect(page.locator('.token-replacement')).toHaveText('800001')
  await expect(page.getByRole('button', { name: 'Confirm read-back' })).toBeVisible()
  await paste(page, 'हाँ।')
  await expect(submit).toBeEnabled()

  await submit.click()
  await expect(page.getByText('Practice form submitted')).toBeVisible()
  await expect(name).toHaveValue('')
  await expect(submit).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Dictate with Wispr Flow' })).toBeEnabled()
})

test('a normal paste stays a draft until sent and an overlong Flow turn makes no writes', async ({ page }) => {
  await setup(page)
  const name = page.locator('[name=applicantName]')
  await compose(page).focus()
  await paste(page, 'Name Meera Devi.')
  await expect(compose(page)).toHaveValue('Name Meera Devi.')
  await expect(name).toHaveValue('')
  await compose(page).press('Enter')
  await expect(name).toHaveValue('Meera Devi')
  await expect(page.getByText('Typed input', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await page.getByRole('button', { name: 'Reset application', exact: true }).click()
  await page.getByRole('button', { name: 'Dictate with Wispr Flow' }).click()
  await paste(page, 'Name Meera Devi. ' + 'Words in a long dictation. '.repeat(100))
  await expect(page.getByText('This turn is too long. Send the dictation in shorter turns.')).toBeVisible()
  await expect(name).toHaveValue('')
  await expect(compose(page)).toHaveValue('')
})

test('a citizen can reject, correct and confirm a silent mobile read-back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => Object.defineProperty(window, 'speechSynthesis', { value: undefined }))
  await page.goto('/#residence')
  await page.getByLabel('Speech language').selectOption('hi')
  const input = compose(page)
  async function say(text: string) {
    await input.fill(text)
    await input.press('Enter')
  }
  await say('नाम मीरा देवी, गाँव फुलवारी, पिनकोड ८००००२')
  await page.getByRole('button', { name: 'Read back', exact: true }).click()
  const open = page.getByRole('button', { name: 'Open citizen view' })
  const dialog = page.getByRole('dialog')
  const submit = page.getByRole('button', { name: 'Submit practice form' })
  await open.click()
  await expect(dialog.getByRole('heading', { name: 'अपनी जानकारी जाँचें' })).toBeVisible()
  await expect(dialog.locator('dd')).toHaveCount(3)
  await dialog.getByRole('button', { name: 'जानकारी बदलें' }).click()
  await expect(input).toBeFocused()
  await expect(submit).toBeDisabled()
  await say('पिनकोड ८००००१')
  await say('Read back')
  await open.click()
  await dialog.getByRole('button', { name: 'मैंने जानकारी जाँच ली है' }).click()
  await expect(submit).toBeDisabled()
  await dialog.getByRole('button', { name: 'हाँ, सब सही है' }).click()
  await dialog.getByRole('button', { name: 'डेस्क पर लौटें' }).last().click()
  await expect(submit).toBeEnabled()
  await submit.click()
  await expect(page.getByText('Practice form submitted')).toBeVisible()
  await expect(input).toHaveValue('')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('an interview binds a bare answer, and switching services protects the draft', async ({ page }) => {
  await setup(page)
  await page.getByLabel('Speech language').selectOption('bho')
  await page.getByRole('button', { name: 'Ask next question' }).click()
  await expect(page.getByText('रउआ के पूरा नाम का ह?')).toBeVisible()
  await compose(page).fill('Meera Devi ba')
  await compose(page).press('Enter')
  await expect(page.locator('[name=applicantName]')).toHaveValue('Meera Devi')
  const route = page.getByRole('button', { name: 'Domicile Certificate', exact: true })
  await route.click()
  await page.getByRole('button', { name: 'Keep working' }).click()
  await expect(page.locator('[name=applicantName]')).toHaveValue('Meera Devi')
  await route.click()
  await page.getByRole('button', { name: 'Open Domicile Certificate' }).click()
  await expect(page.getByRole('heading', { name: 'Domicile Certificate' })).toBeVisible()
  await expect(page.locator('[name=legalName]')).toHaveValue('')
})


test('the keyless pension walkthrough reaches a cleared receipt with browser audio unavailable', async ({ page }) => {
  test.setTimeout(45_000)
  await page.addInitScript(() => Object.defineProperty(window, 'speechSynthesis', { value: undefined }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Play walkthrough' }).click()
  await expect(page.getByText('Sample complete. The practice form is ready to submit.')).toBeVisible({ timeout: 35_000 })
  await expect(page.locator('[name=pincode]')).toHaveValue('800001')
  await page.getByRole('button', { name: 'Go to submission' }).click()
  const submit = page.getByRole('button', { name: 'Submit practice form' })
  await expect(submit).toBeFocused()
  await submit.click()
  await expect(page.getByText('Practice form submitted')).toBeVisible()
  await expect(page.locator('[name=applicantName]')).toHaveValue('')
})
