import { useState } from 'react'
import { EXPLORER, shortAddress } from '../lib/stellar'
import { Check, Copy } from './Icons'

/** Adresse tronquée, avec lien explorateur et bouton copier. */
export function AddressLink({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  const kind = address.startsWith('C') ? 'contract' : 'account'
  const copy = async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <span className="address">
      <a href={`${EXPLORER}/${kind}/${address}`} target="_blank" rel="noreferrer" title={address}>
        {shortAddress(address)}
      </a>
      <button className="icon-btn" onClick={copy} aria-label="Copier l'adresse" title="Copier">
        {copied ? <Check width={13} height={13} /> : <Copy width={13} height={13} />}
      </button>
    </span>
  )
}
