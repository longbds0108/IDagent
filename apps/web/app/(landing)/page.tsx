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
  ['01', 'Agent ID gated', 'Only Agent ID holders can write to the contracts.'],
  ['02', 'Your .ai, verified', 'Bind your name.ai and the registry checks ownerOf on-chain. No reverse-lookup API, no guessing'],
  ['03', 'Evidence, hashed', 'Metadata is canonical JSON anchored by keccak256. Anyone can re-hash it and compare'],
  ['04', 'Revise, never rewrite', 'A revision is a new record. The original evidence hash stays bound to the original, forever'],
  ['05', 'Revocable, not erasable', 'Signers can withdraw a statement at any time, and the withdrawal stays visible in history'],
  ['06', 'Agent-native', 'Agentic Wallet users act through their own AI agent with baw contract-call. No QR codes, no pairing codes'],
] as const

const FAQ = [
  {
    q: 'WHAT IS attested?',
    a: 'Your on-chain portfolio: projects, peer votes and credentials, kept separate.',
  },
  {
    q: 'DO I NEED AN AGENT ID?',
    a: 'Yes. Creating a profile or attesting needs an Agent ID.',
  },
  {
    q: 'HOW DOES IT WORK WITH AN AGENTIC WALLET?',
    a: 'Connect your Agentic Wallet. Your AI agent runs each action; you approve in the Binance App.',
  },
  {
    q: 'DOES A PEER ATTESTATION PROVE MY SKILL?',
    a: 'No. It shows who signed, not that the claim is true.',
  },
  {
    q: 'WHO CAN ISSUE CREDENTIALS?',
    a: 'Only admin-approved organizations.',
  },
  {
    q: 'CAN A RECORD BE DELETED?',
    a: 'No. Every change is a new event and stays visible.',
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
          <p className="sp-kicker">THE RECORDS</p>
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
          <p>THE PROTOCOL</p>
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
              <strong>attested</strong>
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

      <footer className="sp-foot" data-header-theme="dark">
        <div className="sp-foot__inner">
          <div className="sp-foot__top">
            <div className="sp-foot__brand">
              <img src="/attested-logo.png" alt="attested" className="sp-foot__logo" />
              <p className="sp-foot__tag">Verified builder profiles on BNB Smart Chain. Built on Agent ID.</p>
              <div className="sp-foot__cta">
                <Action href="/dashboard">CREATE YOUR PROFILE</Action>
              </div>
            </div>

            <nav className="sp-foot__col" aria-label="Product">
              <h4 className="sp-label">PRODUCT</h4>
              <ul className="sp-foot__links">
                {[
                  ['/builders', 'Builders'],
                  ['/organizations', 'Organizations'],
                  ['/activity', 'Activity'],
                  ['/reputation', 'Reputation'],
                  ['/verify', 'Verify'],
                  ['/dashboard', 'Dashboard'],
                ].map(([href, label]) => (
                  <li key={href}>
                    <Link href={href}>{label}</Link>
                  </li>
                ))}
              </ul>
            </nav>

            {c ? (
              <nav className="sp-foot__col" aria-label="Contracts on BscScan">
                <h4 className="sp-label">CONTRACTS</h4>
                <ul className="sp-foot__links">
                  {(
                    [
                      ['Profiles', c.profileRegistry],
                      ['Projects', c.projectRegistry],
                      ['Attestations', c.attestationRegistry],
                      ['Credentials', c.credentialRegistry],
                      ['Agent ID', publicEnv.agentId],
                    ] as const
                  ).map(([k, addr]) => (
                    <li key={k}>
                      <a href={explorerAddressUrl(addr, publicEnv.explorerUrl)} target="_blank" rel="noreferrer">
                        <span>{k}</span>
                        <span className="sp-foot__addr">
                          {addr.slice(0, 6)}…{addr.slice(-4)} ↗
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
          </div>

          <div className="sp-foot__notes">
            <div>
              <h5>Agent ID</h5>
              <p>An eligibility signal. Not proof of personhood.</p>
            </div>
            <div>
              <h5>Attestations</h5>
              <p>Show who signed. Not proof that the claim is true.</p>
            </div>
            <div>
              <h5>Credentials</h5>
              <p>Show issuance by an approved organization. Not proof of truth.</p>
            </div>
          </div>

          <div className="sp-foot__bottom">
            <span>© 2026 attested</span>
            <span className="sp-foot__status">
              <i aria-hidden /> BNB Smart Chain · chain 56
            </span>
            <span>Not affiliated with Binance or BNB Chain</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
