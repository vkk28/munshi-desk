import { useState } from 'react'
import type { ReactNode } from 'react'
import { Building2, CalendarDays, Landmark, LockKeyhole, MapPin, ShieldCheck, UserRound } from 'lucide-react'

export const portals = {
  pension: { title: 'Old Age Pension', nav: 'Old Age Pension', subtitle: 'Social welfare', description: 'Capture applicant details for a new pension application.', icon: Landmark },
  domicile: { title: 'Domicile Certificate', nav: 'Domicile Certificate', subtitle: 'Revenue services', description: 'Record the applicant’s identity and residential details.', icon: MapPin },
  grievance: { title: 'Municipal Grievance', nav: 'Municipal Grievance', subtitle: 'Municipal services', description: 'Record a local issue for the municipal service desk.', icon: Building2 },
  residence: { title: 'Residence Register', nav: 'Residence Register', subtitle: 'Mixed-label portal', description: 'A bilingual practice portal with a different field order.', icon: Building2 },
}
export type Portal = keyof typeof portals
export const practiceCode = '246810'

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string }
function Input({ label, ...props }: InputProps) {
  return <label className="control">
    <span>{label}{props.required && <b className="required"> *</b>}</span>
    <input autoComplete="off" {...props} />
  </label>
}

function Section({ title, description, icon, children }: { title: string; description: string; icon: ReactNode; children: ReactNode }) {
  return <section className="form-section">
    <header className="section-title">
      <span className="section-icon">{icon}</span>
      <div><h3>{title}</h3><p>{description}</p></div>
    </header>
    <div className="form-grid">{children}</div>
  </section>
}

function District() {
  return <label className="control">
    <span>District</span>
    <select name="district" defaultValue=""><option value="" disabled>Select district</option><option>Patna</option><option>Gaya</option><option>Lucknow</option><option>Chennai</option><option>Bengaluru</option></select>
  </label>
}

function State({ custom = false }: { custom?: boolean }) {
  const options = <><option value="" disabled>Select state</option><option>Bihar</option><option>Delhi</option><option>Karnataka</option><option>Maharashtra</option><option>Tamil Nadu</option><option>Uttar Pradesh</option><option>West Bengal</option></>
  return <label className={`control ${custom ? 'custom-select' : ''}`}>
    <span>State</span>
    <select name="state" defaultValue="">{options}</select>
  </label>
}

function Checkpoint({ captcha = false }: { captcha?: boolean }) {
  return <Section title="Manual verification" description="Complete this security step in the form." icon={<ShieldCheck size={19} />}>
    <Input className="checkpoint" label={captcha ? 'CAPTCHA' : 'One-time password (OTP)'} name={captcha ? 'captcha' : 'otp'}
      placeholder={caption(captcha)} required maxLength={6} minLength={6} inputMode="numeric" pattern={practiceCode} />
    <div className="practice-code" aria-label={`Practice code ${practiceCode}`}>
      <span>Practice code</span><strong>{practiceCode}</strong>
    </div>
  </Section>
}
const caption = (captcha: boolean) => captcha ? 'Enter the practice CAPTCHA' : 'Enter the practice OTP'

function Pension() {
  return <>
    <Section title="Applicant details" description="Identity and contact information" icon={<UserRound size={19} />}>
      <Input id="applicant-name" name="applicantName" label="Full name" placeholder="e.g. Ramdhari Yadav" required maxLength={70} />
      <Input name="fatherName" label="Father’s name" placeholder="Enter father’s name" />
      <Input name="age" label="Age" placeholder="In years" inputMode="numeric" required />
      <Input name="dob" label="Date of birth" type="date" required />
      <Input name="mobile" label="Mobile number" placeholder="10-digit mobile number" inputMode="tel" maxLength={10} />
      <fieldset className="choice-control">
        <legend>Gender</legend>
        {['Male', 'Female', 'Other'].map(gender => <label key={gender}><input name="gender" type="radio" value={gender} />{gender}</label>)}
      </fieldset>
    </Section>
    <Section title="Address details" description="Address and postal information" icon={<MapPin size={19} />}>
      <label className="control wide"><span>Current address</span><textarea name="currentAddress" placeholder="House, street or locality" rows={2} /></label>
      <Input name="pincode" label="PIN code" placeholder="6-digit PIN code" inputMode="numeric" required />
      <District />
      <State />
      <Input name="village" label="Village" placeholder="Enter village or locality" />
      <label className="checkbox-row wide"><input name="sameAddress" type="checkbox" />Permanent address same as current</label>
    </Section>
    <Checkpoint />
  </>
}

function Domicile() {
  const [name, setName] = useState('')
  const [current, setCurrent] = useState('')
  const [permanent, setPermanent] = useState('')
  const [same, setSame] = useState(false)
  return <>
    <Section title="Applicant identity" description="Identity information for the residence certificate" icon={<UserRound size={19} />}>
      <Input name="legalName" label="Applicant name" placeholder="Full name" value={name} onChange={event => setName(event.target.value)} required />
      <Input label="12-digit ID" name="identityNumber" type="text" inputMode="numeric" maxLength={12} placeholder="12-digit test ID" />
      <Input name="mobileNumber" label="Mobile number" placeholder="10-digit mobile number" />
    </Section>
    <Section title="Residential address" description="Current and permanent residency" icon={<MapPin size={19} />}>
      <Input name="currentAddress" label="Current address" placeholder="Full current address" value={current} onChange={event => setCurrent(event.target.value)} required />
      <Input name="permanentAddress" label="Permanent address" placeholder="Full permanent address"
        value={same ? current : permanent} readOnly={same} onChange={event => setPermanent(event.target.value)} />
      <label className="checkbox-row wide"><input name="sameAddress" type="checkbox" checked={same} onChange={event => setSame(event.target.checked)} />Permanent address same as current</label>
      <Input name="pincode" label="PIN code" placeholder="6-digit PIN code" required />
      <State custom />
    </Section>
    <Checkpoint />
  </>
}

function Grievance() {
  const [incident, setIncident] = useState('')
  return <>
    <Section title="Issue details" description="Describe the issue and its location" icon={<Building2 size={19} />}>
      <label className="control wide"><span>Issue description<b className="required"> *</b></span>
        <textarea rows={5} name="description" placeholder="Describe the issue in the neighbourhood" required maxLength={600} />
      </label>
      <Input name="ward" label="Ward" placeholder="Ward number" required />
      <Input name="postal" label="PIN code" placeholder="6-digit PIN code" />
      <label className="control"><span>Incident date</span>
        <input type="date" name="incidentDate" data-munshi-manual value={incident} onChange={event => setIncident(event.target.value)} />
        <small>Choose the date manually.</small>
      </label>
    </Section>
    <Checkpoint captcha />
  </>
}

function Residence() {
  return <Section title="निवास विवरण / Residence details" description="Bilingual labels and fields identified by accessibility names" icon={<CalendarDays size={19} />}>
    <div className="control"><span aria-hidden="true">पिनकोड / PIN code<b className="required"> *</b></span><input aria-label="पिनकोड" placeholder="6-digit PIN code" required /></div>
    <Input name="gaon" label="गाँव / Village" placeholder="Village or locality" required />
    <Input label="आवेदक का नाम / Applicant" placeholder="Full name" required />
    <div className="control"><span aria-hidden="true">मोबाइल / Mobile</span><input aria-label="मोबाइल" placeholder="10-digit mobile number" /></div>
  </Section>
}

export function PracticeForm({ portal, locked }: { portal: Portal; locked: boolean }) {
  const Form = { pension: Pension, domicile: Domicile, grievance: Grievance, residence: Residence }[portal]
  return <form id={`practice-${portal}`} onSubmit={event => event.preventDefault()} autoComplete="off">
    <Form />
    <div className="form-submit">
      <span>{locked ? <LockKeyhole size={15} /> : <ShieldCheck size={16} />}{locked ? 'Confirm read-back to unlock submission.' : 'Read-back confirmed. Ready to submit.'}</span>
      <button className="button primary" type="submit">Submit practice form</button>
    </div>
  </form>
}
