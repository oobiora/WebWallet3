import type { ChainInfo, LotwConnector, LotwEvent } from './types'

import {
  interpret,
  type Observer,
  type Subscription,
  type InterpreterFrom,
  type StateValueFrom,
  type Subscribable,
} from 'xstate'

import { makeWalletMachine } from './wallet.machine'

type WalletStateValue<Id extends string> = StateValueFrom<
  ReturnType<typeof makeWalletMachine<Id>>
>

export class Lotw<Id extends string> implements Subscribable<LotwEvent> {
  private _walletActor: InterpreterFrom<
    ReturnType<typeof makeWalletMachine<Id>>
  >

  constructor(connectors: LotwConnector<Id>[], _options?: {}) {
    this._walletActor = interpret(makeWalletMachine(connectors)).start()
  }

  /**
   * Lotw instance as an observable
   */
  subscribe(
    nextOrObserver: Observer<LotwEvent> | ((value: LotwEvent) => void)
  ): Subscription {
    const next =
      typeof nextOrObserver === 'object' ? nextOrObserver.next : nextOrObserver

    if (this._walletActor.state.matches('Connected')) {
      next({
        type: 'LOTW_CONNECTED',
        accounts: this._walletActor.state.context.accounts,
        chain: this._walletActor.state.context.chainId!,
      })
    } else {
      next({ type: 'LOTW_DISCONNECTED' })
    }

    const connectedCallback = (accounts: string[], chain: string) =>
      next({ type: 'LOTW_CONNECTED', accounts, chain })
    const disconnectedCallback = () => next({ type: 'LOTW_DISCONNECTED' })
    const accountsChangedCallback = (accounts: string[]) =>
      next({ type: 'LOTW_ACCOUNTS_CHANGED', accounts })
    const chainChangedCallback = (chain: string) =>
      next({ type: 'LOTW_CHAIN_CHANGED', chain })

    this.on('connected', connectedCallback)
    this.on('disconnected', disconnectedCallback)
    this.on('accountsChanged', accountsChangedCallback)
    this.on('chainChanged', chainChangedCallback)

    return {
      unsubscribe: () => {
        this.off('connected', connectedCallback)
        this.off('disconnected', disconnectedCallback)
        this.off('accountsChanged', accountsChangedCallback)
        this.on('chainChanged', chainChangedCallback)
      },
    }
  }

  /**
   * Whether the current state is, or is a child of, the given state value
   */
  is(stateValue: WalletStateValue<Id>) {
    this._walletActor.state.matches(stateValue)
  }

  /**
   * Attempts to connect to the given wallet, rejecting if an error occurs or a user rejects
   *
   * @param connectorId - The connector id to be used when attempting to connect
   * @param chainInfo - Optional chain info to automatically switch networks as part connecting
   */
  connectWallet(connectorId: Id, chainInfo?: ChainInfo) {
    return new Promise<void>((resolve, reject) => {
      this._walletActor.send({
        type: 'CONNECT',
        connector: connectorId,
        chain: chainInfo,
        successCallback: resolve,
        failureCallback: reject,
      })
    })
  }

  /**
   * Disconnects from the current wallet
   */
  disconnectWallet() {
    this._walletActor.send({ type: 'DISCONNECT' })
  }

  /**
   * Requests the wallet to switch to the given network chain info
   * @param chainInfo - The chain info to switch to
   */
  switchNetwork(chainInfo: ChainInfo) {
    return new Promise<void>((resolve, reject) => {
      this._walletActor.send({
        type: 'SWITCH_NETWORK',
        chain: chainInfo,
        successCallback: resolve,
        failureCallback: reject,
      })
    })
  }

  /**
   * Returns the current connector instance, or null if no wallet is connected
   */
  getConnector() {
    return this._walletActor.state.context.connector
  }

  /*
   * Returns the current connector id, or null if no wallet is connected
   */
  getConnectorId() {
    return this.getConnector()?.id() ?? null
  }

  /**
   * Returns the current provider instance, or null if no wallet is connected
   */
  getProvider() {
    return this.getConnector()?.getProvider() ?? null
  }

  private get _emitter() {
    return this._walletActor.state.context.emitter
  }

  on(
    event: 'connected',
    callback: (accounts: string[], chainId: string) => void
  ): void
  on(event: 'disconnected', callback: () => void): void
  on(event: 'accountsChanged', callback: (accounts: string[]) => void): void
  on(event: 'chainChanged', callback: (chainId: string) => void): void
  on(event: string, callback: (...args: any[]) => void) {
    this._emitter.on(event, callback)
  }

  once(
    event: 'connected',
    callback: (accounts: string[], chainId: string) => void
  ): void
  once(event: 'disconnected', callback: () => void): void
  once(event: 'accountsChanged', callback: (accounts: string[]) => void): void
  once(event: 'chainChanged', callback: (chainId: string) => void): void
  once(event: string, callback: (...args: any[]) => void) {
    this._emitter.once(event, callback)
  }

  off(
    event: 'connected',
    callback: (accounts: string[], chainId: string) => void
  ): void
  off(event: 'disconnected', callback: () => void): void
  off(event: 'accountsChanged', callback: (accounts: string[]) => void): void
  off(event: 'chainChanged', callback: (chainId: string) => void): void
  off(event: string, callback: (...args: any[]) => void) {
    this._emitter.off(event, callback)
  }

  /**
   * Internal use only / Escape hatch if needed
   *
   * Returns the wrapped xstate interpreter
   */
  getWalletActor() {
    return this._walletActor
  }
}
