import Link from 'next/link'
import { explorerAddressUrl } from '@skillproof/shared'
import { AsciiField } from '@/components/landing/ascii-field'
import { FaqList, PrinciplesGrid, Reveal } from '@/components/landing/interactive'
import { LandingHeader } from '@/components/landing/landing-header'
import { TextScramble } from '@/components/landing/text-scramble'
import { deployedContracts, publicEnv } from '@/lib/env'
import { protocolStats, type ProtocolStats } from '@/lib/reads'

export const revalidate = 30

const PRINCIPLES = [
  ['01', 'Agent ID gated', 'The contracts call balanceOf on the official Agent ID contract before any profile, project or attestation is written'],
  ['02', 'Your .ai, verified', 'Bind your name.ai and the registry checks ownerOf on-chain. No reverse-lookup API, no guessing'],
  ['03', 'Evidence, hashed', 'Metadata is canonical JSON anchored by keccak256. Anyone can re-hash it and compare'],
  ['04', 'Revise, never rewrite', 'A revision is a new record. The original evidence hash stays bound to the original, forever'],
  ['05', 'Revocable, not erasable', 'Signers can withdraw a statement at any time, and the withdrawal stays visible in history'],
  ['06', 'Agent-native', 'Agentic Wallet users act through their own AI agent with baw contract-call. No QR codes, no pairing codes'],
] as const

const FAQ = [
  {
    q: 'WHAT IS SKILLPROOF?',
    a: 'An on-chain builder portfolio on BNB Smart Chain. You publish projects with evidence, other Agent ID holders attest to the skills they witnessed, and approved organizations issue credentials. All three stay separate',
  },
  {
    q: 'DO I NEED AN AGENT ID?',
    a: 'To create a profile, add projects or sign attestations, yes: the contracts check it. Visitors need nothing, and approved organization issuers do not need one either',
  },
  {
    q: 'HOW DOES IT WORK WITH AN AGENTIC WALLET?',
    a: 'Enter your Agentic Wallet address on the dashboard. For each action SkillProof prepares calldata and a baw contract-call preview command; your own AI agent runs it and you confirm in the Binance App. SkillProof never holds keys or sessions',
  },
  {
    q: 'DOES A PEER ATTESTATION PROVE MY SKILL?',
    a: 'No. It proves that another Agent ID holder signed a public statement about your work. Readers decide how much weight to give it. SkillProof never turns attestations into a single trust score',
  },
  {
    q: 'WHO CAN ISSUE CREDENTIALS?',
    a: 'Only organization wallets the protocol admin has approved. A credential shows as valid only while it is unrevoked, unexpired and its issuer is still approved',
  },
  {
    q: 'CAN A RECORD BE DELETED?',
    a: 'No. Projects can be revised or revoked and attestations and credentials can be revoked, but every change is a new on-chain event that stays inspectable',
  },
] as const

const CARDS = [
  {
    key: 'self',
    title: 'Self',
    label: 'Self-reported',
    rows: [
      ['SIGNED BY', 'Profile owner'],
      ['GATE', 'Agent ID holder'],
      ['WITHDRAWN BY', 'Owner'],
    ],
    note: 'PROVES · WHO PUBLISHED IT, NOT THAT IT IS TRUE',
    contract: 'projectRegistry',
    contractName: 'ProjectEvidenceRegistry',
  },
  {
    key: 'peer',
    title: 'Peer',
    label: 'Peer attested',
    rows: [
      ['SIGNED BY', 'Another holder'],
      ['GATE', 'Agent ID · never self'],
      ['LIMIT', '1 active per skill'],
    ],
    note: 'PROVES · WHO SIGNED, NOT THAT THE STATEMENT IS TRUE',
    contract: 'attestationRegistry',
    contractName: 'SkillAttestation',
  },
  {
    key: 'issuer',
    title: 'Issuer',
    label: 'Approved issuer credential',
    rows: [
      ['SIGNED BY', 'Approved org'],
      ['GATE', 'Admin allowlist'],
      ['STATUS', 'Valid · expired · revoked'],
    ],
    note: 'PROVES · ISSUANCE BY AN APPROVED ORG, NOT INFALLIBILITY',
    contract: 'credentialRegistry',
    contractName: 'CredentialRegistry',
  },
] as const

async function loadStats(): Promise<ProtocolStats | null> {
  if (!deployedContracts()) return null
  try {
    return await protocolStats()
  } catch {
    return null
  }
}

function Action({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="sp-action">
      <span>{children}</span>
      <span className="sp-action__icon" aria-hidden>
        ↗
      </span>
    </Link>
  )
}

export default async function Landing() {
  const stats = await loadStats()
  const c = deployedContracts()
  const statRows: [string, number | undefined][] = [
    ['PROFILES', stats?.profiles],
    ['PROJECTS', stats?.projects],
    ['ATTESTATIONS', stats?.attestations],
    ['CREDENTIALS', stats?.credentials],
    ['ACTIVE ISSUERS', stats?.issuers],
  ]

  return (
    <div className="sp-page">
      <LandingHeader />

      <section className="sp-hero sp-dark" data-header-theme="dark">
        <div className="sp-hero__copy">
          <p className="sp-kicker">AGENT ID · BNB SMART CHAIN MAINNET · CHAIN 56</p>
          <h1 className="sp-rise">
            Show the work
            <br />
            Name who
            <br />
            vouched
          </h1>
          <p className="sp-hero__body sp-rise sp-rise--2">
            A builder portfolio where every claim carries its receipts: what you published, which Agent ID holders signed for
            it, and which approved organizations issued credentials. Each stays on its own line
          </p>
          <div className="sp-hero__actions sp-rise sp-rise--3">
            <Action href="/dashboard">CREATE YOUR PROFILE</Action>
            <Link href="/builders">EXPLORE BUILDERS</Link>
            <Link href="/verify">VERIFY A RECORD</Link>
          </div>
        </div>
        <div className="sp-hero__visual">
          <AsciiField />
        </div>
      </section>

      <section id="records" className="sp-records sp-dark" data-header-theme="dark" data-nav="records">
        <div className="sp-records__rail">
          <p className="sp-kicker">// THE RECORDS</p>
          <h2>
            Three records
            <br />
            One honest
            <br />
            profile
          </h2>
          <p>Never merged into one green tick. Counters are read live from the deployed contracts</p>
          <dl className="sp-stats">
            {statRows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v === undefined ? '—' : v.toLocaleString('en-US')}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="sp-records__cards">
          {CARDS.map((card, i) => (
            <Reveal key={card.key} delay={i * 80}>
              <article className={`sp-card sp-card--${card.key}`}>
                <div className="sp-card__top">
                  <span>0{i + 1}</span>
                  <span className="sp-card__status">
                    <i /> BSC MAINNET
                  </span>
                </div>
                <div className="sp-card__identity">
                  <span className={`sp-card__glyph sp-card__glyph--${card.key}`} aria-hidden />
                  <div>
                    <h3>{card.title}</h3>
                    <p>{card.label}</p>
                  </div>
                </div>
                <div className="sp-card__rows">
                  {card.rows.map(([k, v]) => (
                    <div key={k}>
                      <span>{k}</span>
                      <strong>{v}</strong>
                    </div>
                  ))}
                </div>
                <div className="sp-card__foot">
                  <span>{card.note}</span>
                  {c ? (
                    <a href={explorerAddressUrl(c[card.contract], publicEnv.explorerUrl)} target="_blank" rel="noreferrer">
                      {card.contractName.toUpperCase()} ↗
                    </a>
                  ) : null}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="protocol" className="sp-principles sp-light" data-header-theme="light" data-nav="protocol">
        <div className="sp-principles__heading">
          <h2>
            <TextScramble text="Built so a claim can't outrun its evidence" />
          </h2>
          <p>// THE PROTOCOL</p>
        </div>
        <PrinciplesGrid items={PRINCIPLES} />
      </section>

      <section id="faq" className="sp-faq sp-dark" data-header-theme="dark" data-nav="faq">
        <div className="sp-faq__heading">
          <h2>FAQs</h2>
        </div>
        <FaqList items={FAQ} />
      </section>

      <section id="start" className="sp-cta sp-light" data-header-theme="light" data-nav="start">
        <div className="sp-cta__map" aria-hidden>
          <div className="sp-cta__map-heading">
            <span>FROM CLAIM TO PROOF</span>
            <span>BSC MAINNET</span>
          </div>
          <div className="sp-cta__rail">
            <div className="sp-cta__node sp-cta__node--start">
              <i />
              <strong>AGENT ID</strong>
              <small>ELIGIBILITY</small>
            </div>
            <div className="sp-cta__node sp-cta__node--core">
              <i>✓</i>
              <strong>SKILLPROOF</strong>
              <small>RECORD</small>
            </div>
            <div className="sp-cta__node sp-cta__node--end">
              <i />
              <strong>VERIFY</strong>
              <small>ANYONE</small>
            </div>
          </div>
        </div>
        <div>
          <h2>
            Put your work
            <br />
            on the record
          </h2>
        </div>
        <div className="sp-cta__action">
          <p>REGISTER · ATTEST · VERIFY</p>
          <Action href="/dashboard">CREATE YOUR PROFILE</Action>
          <span>BSC MAINNET · CHAIN 56 · GAS IN BNB</span>
        </div>
      </section>

      <footer className="sp-footer sp-dark" data-header-theme="dark">
        <div className="sp-footer__top">
          <div>
            <strong>SkillProof</strong>
            <p>EVIDENCE-BACKED BUILDER PROFILES</p>
            <ul className="sp-footer__limits">
              <li>Agent ID is an eligibility signal, not proof of personhood</li>
              <li>Attestations are signed statements, not proof of truth</li>
              <li>Credentials prove issuance, not infallibility</li>
            </ul>
          </div>
          <div className="sp-footer__nav">
            <nav aria-label="Site">
              <Link href="/builders">BUILDERS</Link>
              <Link href="/organizations">ORGANIZATIONS</Link>
              <Link href="/activity">ACTIVITY</Link>
              <Link href="/reputation">REPUTATION</Link>
              <Link href="/verify">VERIFY</Link>
              <Link href="/dashboard">DASHBOARD</Link>
            </nav>
            {c ? (
              <nav aria-label="Contracts on BscScan">
                {(
                  [
                    ['PROFILES', c.profileRegistry],
                    ['PROJECTS', c.projectRegistry],
                    ['ATTESTATIONS', c.attestationRegistry],
                    ['CREDENTIALS', c.credentialRegistry],
                    ['AGENT ID', publicEnv.agentId],
                  ] as const
                ).map(([k, a]) => (
                  <a key={k} href={explorerAddressUrl(a, publicEnv.explorerUrl)} target="_blank" rel="noreferrer">
                    {k} ↗
                  </a>
                ))}
              </nav>
            ) : null}
          </div>
        </div>
        <div className="sp-footer__wordmark" aria-hidden>
          SKILLPROOF
        </div>
        <div className="sp-footer__bottom">
          <span>© 2026 SKILLPROOF</span>
          <span>BUILT ON BNB SMART CHAIN</span>
          <span>NOT AFFILIATED WITH BINANCE OR BNB CHAIN</span>
        </div>
      </footer>
    </div>
  )
}
