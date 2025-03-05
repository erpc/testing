import { Address, BigDecimal, BigInt, dataSource } from '@graphprotocol/graph-ts'

import { NativeTokenDetails } from './nativeTokenDetails'
import { StaticTokenDefinition } from './staticTokenDefinition'

export enum ChainId {
  SEPOLIA = 11155111,
}

// assemblyscript does not support string enums, hence these constants
const SEPOLIA_NETWORK_NAME = 'sepolia'
const UNICHAIN_SEPOLIA_NETWORK_NAME = 'unichain-sepolia'
const ARBITRUM_SEPOLIA_NETWORK_NAME = 'arbitrum-sepolia'
const BASE_SEPOLIA_NETWORK_NAME = 'base-sepolia'
const ARBITRUM_ONE_NETWORK_NAME = 'arbitrum-one'
const BASE_NETWORK_NAME = 'base'
const MATIC_NETWORK_NAME = 'matic'
const BSC_NETWORK_NAME = 'bsc'
const OPTIMISM_NETWORK_NAME = 'optimism'
const AVALANCHE_NETWORK_NAME = 'avalanche'
const WORLDCHAIN_MAINNET_NETWORK_NAME = 'worldchain-mainnet'
const ZORA_MAINNET_NETWORK_NAME = 'zora-mainnet'
const MAINNET_NETWORK_NAME = 'mainnet'
const BLAST_MAINNET_NETWORK_NAME = 'blast-mainnet'
const UNICHAIN_MAINNET_NETWORK_NAME = 'unichain-mainnet'
// Note: All token and pool addresses should be lowercased!
export class SubgraphConfig {
  // deployment address
  poolManagerAddress: string

  // the address of a pool where one token is a stablecoin and the other is a
  // token that tracks the price of the native token use this to calculate the
  // price of the native token, so prefer a pool with highest liquidity
  stablecoinWrappedNativePoolId: string

  // true is stablecoin is token0, false if stablecoin is token1
  stablecoinIsToken0: boolean

  // the address of a token that tracks the price of the native token, most of
  // the time, this is a wrapped asset but could also be the native token itself
  // for some chains
  wrappedNativeAddress: string

  // the mimimum liquidity in a pool needed for it to be used to help calculate
  // token prices. for new chains, this should be initialized to ~4000 USD
  minimumNativeLocked: BigDecimal

  // list of stablecoin addresses
  stablecoinAddresses: string[]

  // a token must be in a pool with one of these tokens in order to derive a
  // price (in addition to passing the minimumEthLocked check). This is also
  // used to determine whether volume is tracked or not.
  whitelistTokens: string[]

  // token overrides are used to override RPC calls for the symbol, name, and
  // decimals for tokens. for new chains this is typically empty.
  tokenOverrides: StaticTokenDefinition[]

  // skip the creation of these pools in handlePoolCreated. for new chains this is typically empty.
  poolsToSkip: string[]

  // initialize this list of pools and token addresses on factory creation. for new chains this is typically empty.
  poolMappings: Array<Address[]>

  // native token details for the chain.
  nativeTokenDetails: NativeTokenDetails
}

export function getSubgraphConfig(): SubgraphConfig {
  // Update this value to the corresponding chain you want to deploy
  const selectedNetwork = dataSource.network()

  if (selectedNetwork == SEPOLIA_NETWORK_NAME) {
    return {
      poolManagerAddress: '0xe03a1074c86cfedd5c142c4f04f1a1536e203543',
      stablecoinWrappedNativePoolId: '0xabdb9820d36431e092c155f7151c4c781f09fb4e1b7894fa918a0aadcac87e16',
      stablecoinIsToken0: true,
      wrappedNativeAddress: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14', // WETH
      minimumNativeLocked: BigDecimal.fromString('1'),
      stablecoinAddresses: [
        '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', // USDC
        '0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0', // USDT
      ],
      whitelistTokens: [
        '0x0000000000000000000000000000000000000000', // Native ETH
        '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', // USDC
        '0xaa8e23fb1079ea71e0a56f48a2aa51851d8433d0', // USDT,
        '0xfff9976782d46cc05630d1f6ebab18b2324d6b14', // WETH
      ],
      tokenOverrides: [],
      poolsToSkip: [],
      poolMappings: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: BigInt.fromI32(18),
      },
    }
  } else if (selectedNetwork == UNICHAIN_SEPOLIA_NETWORK_NAME) {
    return {
      poolManagerAddress: '0x00b036b58a818b1bc34d502d3fe730db729e62ac',
      stablecoinWrappedNativePoolId: '0x1927686e9757bb312fc499e480536d466c788dcdc86a1b62c82643157f05b603', // https://unichain-sepolia.blockscout.com/tx/0x6461a80bbdd78222097c8f0437952dba852f25c3822df50660e347ccd6436f6f?tab=logs
      stablecoinIsToken0: true,
      wrappedNativeAddress: '0x4200000000000000000000000000000000000006', // WETH
      minimumNativeLocked: BigDecimal.fromString('1'),
      stablecoinAddresses: [
        '0x31d0220469e10c4e71834a79b1f276d740d3768f', // USDC
      ],
      whitelistTokens: [
        '0x0000000000000000000000000000000000000000', // Native ETH
        '0x31d0220469e10c4e71834a79b1f276d740d3768f', // USDC
        '0x4200000000000000000000000000000000000006', // WETH
      ],
      tokenOverrides: [],
      poolsToSkip: [],
      poolMappings: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: BigInt.fromI32(18),
      },
    }
  } else if (selectedNetwork == ARBITRUM_SEPOLIA_NETWORK_NAME) {
    return {
      poolManagerAddress: '0xfb3e0c6f74eb1a21cc1da29aec80d2dfe6c9a317',
      stablecoinWrappedNativePoolId: '', // no v4 pool exists on arbitrum sepolia yet, this will result in $0 prices
      stablecoinIsToken0: true,
      wrappedNativeAddress: '0x980b62da83eff3d4576c647993b0c1d7faf17c73', // WETH
      minimumNativeLocked: BigDecimal.fromString('1'),
      stablecoinAddresses: [
        '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d', // USDC
      ],
      whitelistTokens: [
        '0x0000000000000000000000000000000000000000', // Native ETH
        '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d', // USDC
        '0x980b62da83eff3d4576c647993b0c1d7faf17c73', // WETH
      ],
      tokenOverrides: [],
      poolsToSkip: [],
      poolMappings: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: BigInt.fromI32(18),
      },
    }
  } else if (selectedNetwork == BASE_SEPOLIA_NETWORK_NAME) {
    return {
      poolManagerAddress: '0x05e73354cfdd6745c338b50bcfdfa3aa6fa03408',
      stablecoinWrappedNativePoolId: '0xcafe1ec4f71a632f8fc57506c478d0b25b399a9aa003c9bc02c444639578ae46', // https://sepolia.basescan.org/tx/0xa8a8ad7ed9fe1e44ce264f240821a33bfd93a385397b46fd7142deee242be2fa#eventlog
      stablecoinIsToken0: true,
      wrappedNativeAddress: '0x4200000000000000000000000000000000000006', // WETH
      minimumNativeLocked: BigDecimal.fromString('1'),
      stablecoinAddresses: [
        '0x036cbd53842c5426634e7929541ec2318f3dcf7e', // USDC
      ],
      whitelistTokens: [
        '0x0000000000000000000000000000000000000000', // Native ETH
        '0x036cbd53842c5426634e7929541ec2318f3dcf7e', // USDC
        '0x4200000000000000000000000000000000000006', // WETH
      ],
      tokenOverrides: [],
      poolsToSkip: [],
      poolMappings: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: BigInt.fromI32(18),
      },
    }
  } else if (selectedNetwork == ARBITRUM_ONE_NETWORK_NAME) {
    return {
      poolManagerAddress: '0x360e68faccca8ca495c1b759fd9eee466db9fb32',
      stablecoinWrappedNativePoolId: '0xfc7b3ad139daaf1e9c3637ed921c154d1b04286f8a82b805a6c352da57028653', // https://arbiscan.io/tx/0xd2542ab5fa8cb1b0606c6f114d9589e35db6d02dee426b7d874bda7c6e05f641#eventlog
      stablecoinIsToken0: false,
      wrappedNativeAddress: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
      minimumNativeLocked: BigDecimal.fromString('1'),
      stablecoinAddresses: [
        '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', // USDC.e
        '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', // DAI
        '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', // USDT
        '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC
      ],
      whitelistTokens: [
        '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', // WETH
        '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', // USDC.e
        '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', // DAI
        '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', // USDT
        '0xaf88d065e77c8cc2239327c5edb3a432268e5831', // USDC
        '0x0000000000000000000000000000000000000000', // Native ETH
      ],
      tokenOverrides: [
        {
          address: Address.fromString('0x82af49447d8a07e3bd95bd0d56f35241523fbab1'),
          symbol: 'WETH',
          name: 'Wrapped Ethereum',
          decimals: BigInt.fromI32(18),
        },
        {
          address: Address.fromString('0xff970a61a04b1ca14834a43f5de4533ebddb5cc8'),
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: BigInt.fromI32(6),
        },
      ],
      poolsToSkip: [],
      poolMappings: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: BigInt.fromI32(18),
      },
    }
  } else if (selectedNetwork == BASE_NETWORK_NAME) {
    return {
      poolManagerAddress: '0x498581ff718922c3f8e6a244956af099b2652b2b',
      stablecoinWrappedNativePoolId: '0x90333bb05c258fe0dddb2840ef66f1a05165aa7dac6815d24e807cc6ebd943a0', // https://basescan.org/tx/0xf7f4eb1aef74a635a1bf42d598049afbed8ec9e303be81bf168b94a71045decb#eventlog
      stablecoinIsToken0: false,
      wrappedNativeAddress: '0x4200000000000000000000000000000000000006', // WETH
      minimumNativeLocked: BigDecimal.fromString('1'),
      stablecoinAddresses: [
        '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
      ],
      whitelistTokens: [
        '0x4200000000000000000000000000000000000006', // WETH
        '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
        '0x0000000000000000000000000000000000000000', // Native ETH
      ],
      tokenOverrides: [],
      poolsToSkip: [],
      poolMappings: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: BigInt.fromI32(18),
      },
    }
  } else if (selectedNetwork == MATIC_NETWORK_NAME) {
    return {
      poolManagerAddress: '0x67366782805870060151383f4bbff9dab53e5cd6',
      stablecoinWrappedNativePoolId: '0x15484bc239f7554e7ead77c45834c722d3f74a9b20826fdf21bbb1b026444286', // https://polygonscan.com/tx/0x6c94e24c0ddff6dd9bfa860561945330c81df85ebb4b1ecf75a459b016719314
      stablecoinIsToken0: false,
      wrappedNativeAddress: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', // WMATIC
      minimumNativeLocked: BigDecimal.fromString('20000'),
      stablecoinAddresses: [
        '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // USDC.e
        '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063', // DAI
        '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', // USDC
      ],
      whitelistTokens: [
        '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', // WMATIC
        '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619', // WETH
        '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // USDC.e
        '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063', // DAI
        '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', // USDC
        '0x0000000000000000000000000000000000000000', // Native POL
      ],
      tokenOverrides: [],
      poolsToSkip: [],
      poolMappings: [],
      nativeTokenDetails: {
        symbol: 'POL',
        name: 'Polygon',
        decimals: BigInt.fromI32(18),
      },
    }
  } else if (selectedNetwork == BSC_NETWORK_NAME) {
    return {
      poolManagerAddress: '0x28e2ea090877bf75740558f6bfb36a5ffee9e9df',
      stablecoinWrappedNativePoolId: '0x4c9dff5169d88f7fbf5e43fc8e2eb56bf9791785729b9fc8c22064a47af12052', // https://bscscan.com/tx/0x36c1e4c7b4105a0be337addc32b5564dd3494fccfe331bf9fe7c647163d27d05#eventlog
      stablecoinIsToken0: true,
      wrappedNativeAddress: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', // WBNB
      minimumNativeLocked: BigDecimal.fromString('10'),
      stablecoinAddresses: [
        '0x55d398326f99059ff775485246999027b3197955', // USDT
        '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC
      ],
      whitelistTokens: [
        '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', // WBNB
        '0x55d398326f99059ff775485246999027b3197955', // USDT
        '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC
        '0x0000000000000000000000000000000000000000', // Native BNB
      ],
      tokenOverrides: [],
      poolsToSkip: [],
      poolMappings: [],
      nativeTokenDetails: {
        symbol: 'BNB',
        name: 'Binance Coin',
        decimals: BigInt.fromI32(18),
      },
    }
  } else if (selectedNetwork == OPTIMISM_NETWORK_NAME) {
    return {
      poolManagerAddress: '0x9a13f98cb987694c9f086b1f5eb990eea8264ec3',
      stablecoinWrappedNativePoolId: '0xedba0a2a9dc73acf4b130e07605cb4c212bbd98a31c9cd442cfb8cf5b4e093e7', // https://optimistic.etherscan.io/tx/0x5a7ce7eaa8a1ae27a84846b0152d2910ec8db0c4d62b0968e0a49830d882ad28
      stablecoinIsToken0: true,
      wrappedNativeAddress: '0x4200000000000000000000000000000000000006', // WETH
      minimumNativeLocked: BigDecimal.fromString('1'),
      stablecoinAddresses: [
        '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', // DAI
        '0x7f5c764cbc14f9669b88837ca1490cca17c31607', // USDC.e
        '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', // USDT
        '0x0b2c639c533813f4aa9d7837caf62653d097ff85', // USDC
      ],
      whitelistTokens: [
        '0x4200000000000000000000000000000000000006', // WETH
        '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1', // DAI
        '0x7f5c764cbc14f9669b88837ca1490cca17c31607', // USDC.e
        '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', // USDT
        '0x4200000000000000000000000000000000000042', // OP
        '0x9e1028f5f1d5ede59748ffcee5532509976840e0', // PERP
        '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', // LYRA
        '0x68f180fcce6836688e9084f035309e29bf0a2095', // WBTC
        '0x0b2c639c533813f4aa9d7837caf62653d097ff85', // USDC
        '0x0000000000000000000000000000000000000000', // Native ETH
      ],
      tokenOverrides: [
        {
          address: Address.fromString('0x82af49447d8a07e3bd95bd0d56f35241523fbab1'),
          symbol: 'WETH',
          name: 'Wrapped Ethereum',
          decimals: BigInt.fromI32(18),
        },
      ],
      poolMappings: [],
      poolsToSkip: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: BigInt.fromI32(18),
      },
    }
  } else if (selectedNetwork == AVALANCHE_NETWORK_NAME) {
    return {
      poolManagerAddress: '0x06380c0e0912312b5150364b9dc4542ba0dbbc85',
      stablecoinWrappedNativePoolId: '0xd7a8035ddd9ec1dba25e3b27b685927fe63d65281f21c1c1d21d122fc48caeb7', // https://snowtrace.io/tx/0x008bbcac5d411e48621c94f75f3dedf025a031d2633a548fb372f45f73db111d/eventlog?chainid=43114
      stablecoinIsToken0: false,
      wrappedNativeAddress: '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7', // WAVAX
      minimumNativeLocked: BigDecimal.fromString('100'),
      stablecoinAddresses: [
        '0xd586e7f844cea2f87f50152665bcbc2c279d8d70', // DAI_E
        '0xba7deebbfc5fa1100fb055a87773e1e99cd3507a', // DAI
        '0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664', // USDC_E
        '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e', // USDC
        '0xc7198437980c041c805a1edcba50c1ce5db95118', // USDT_E
        '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7', // USDT
      ],
      whitelistTokens: [
        '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7', // WAVAX
        '0xd586e7f844cea2f87f50152665bcbc2c279d8d70', // DAI_E
        '0xba7deebbfc5fa1100fb055a87773e1e99cd3507a', // DAI
        '0xa7d7079b0fead91f3e65f86e8915cb59c1a4c664', // USDC_E
        '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e', // USDC
        '0xc7198437980c041c805a1edcba50c1ce5db95118', // USDT_E
        '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7', // USDT
        '0x130966628846bfd36ff31a822705796e8cb8c18d', // MIM
        '0x0000000000000000000000000000000000000000', // Native AVX
      ],
      tokenOverrides: [],
      poolsToSkip: [],
      poolMappings: [],
      nativeTokenDetails: {
        symbol: 'AVAX',
        name: 'Avalanche',
        decimals: BigInt.fromI32(18),
      },
    }
  } else if (selectedNetwork == WORLDCHAIN_MAINNET_NETWORK_NAME) {
    return {
      poolManagerAddress: '0xb1860d529182ac3bc1f51fa2abd56662b7d13f33',
      stablecoinWrappedNativePoolId: '0x45c70c27c25654e8c73bc0d63ba350144de8207a73c53d38409d3e127d993dc7', // https://worldchain-mainnet.explorer.alchemy.com/tx/0x042848d1377542415c68a8f8901923f2e54a4596016890eefb7c5094e45775d7?tab=logs
      stablecoinIsToken0: false,
      wrappedNativeAddress: '0x4200000000000000000000000000000000000006', // WETH
      minimumNativeLocked: BigDecimal.fromString('1'),
      stablecoinAddresses: [
        '0x79a02482a880bce3f13e09da970dc34db4cd24d1', // USDC.e
      ],
      whitelistTokens: [
        '0x4200000000000000000000000000000000000006', // WETH
        '0x79a02482a880bce3f13e09da970dc34db4cd24d1', // USDC.e
        '0x03c7054bcb39f7b2e5b2c7acb37583e32d70cfa3', // WBTC
        '0x2cfc85d8e48f8eab294be644d9e25c3030863003', // WLD
        '0x859dbe24b90c9f2f7742083d3cf59ca41f55be5d', // sDAI
        '0x0000000000000000000000000000000000000000', // Native ETH
      ],
      tokenOverrides: [],
      poolsToSkip: [],
      poolMappings: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: BigInt.fromI32(18),
      },
    }
  } else if (selectedNetwork == ZORA_MAINNET_NETWORK_NAME) {
    return {
      poolManagerAddress: '0x0575338e4c17006ae181b47900a84404247ca30f',
      stablecoinWrappedNativePoolId: '0x8362fda2356bf98851192da5b5b89553dd92ad73f8e8d6be97f154ce72b0adfe', // https://explorer.zora.energy/tx/0x8a0cd1856e3c95918e78478ccc993a6e745e364d5036852f44033827be880a17
      stablecoinIsToken0: false,
      wrappedNativeAddress: '0x4200000000000000000000000000000000000006', // WETH
      minimumNativeLocked: BigDecimal.fromString('1'),
      stablecoinAddresses: [
        '0xcccccccc7021b32ebb4e8c08314bd62f7c653ec4', // USDzC
      ],
      whitelistTokens: [
        '0x4200000000000000000000000000000000000006', // WETH
        '0xcccccccc7021b32ebb4e8c08314bd62f7c653ec4', // USDzC
        '0x0000000000000000000000000000000000000000', // Native ETH
      ],
      tokenOverrides: [],
      poolsToSkip: [],
      poolMappings: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: BigInt.fromI32(18),
      },
    }
  } else if (selectedNetwork == MAINNET_NETWORK_NAME) {
    return {
      poolManagerAddress: '0x000000000004444c5dc75cb358380d2e3de08a90',
      stablecoinWrappedNativePoolId: '0x4f88f7c99022eace4740c6898f59ce6a2e798a1e64ce54589720b7153eb224a7', // https://etherscan.io/tx/0x4e63fcc0dd42a2b317e77d17e236cadf77464a08ccece33a354bd8648b5f7419#eventlog
      stablecoinIsToken0: true,
      wrappedNativeAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
      minimumNativeLocked: BigDecimal.fromString('1'),
      stablecoinAddresses: [
        '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
        '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
        '0x0000000000085d4780b73119b644ae5ecd22b376', // TUSD
        '0x956f47f50a910163d8bf957cf5846d573e7f87ca', // FEI
      ],
      whitelistTokens: [
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
        '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC
        '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
        '0x0000000000085d4780b73119b644ae5ecd22b376', // TUSD
        '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC
        '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643', // cDAI
        '0x39aa39c021dfbae8fac545936693ac917d5e7563', // cUSDC
        '0x86fadb80d8d2cff3c3680819e4da99c10232ba0f', // EBASE
        '0x57ab1ec28d129707052df4df418d58a2d46d5f51', // sUSD
        '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2', // MKR
        '0xc00e94cb662c3520282e6f5717214004a7f26888', // COMP
        '0x514910771af9ca656af840dff83e8264ecf986ca', // LINK
        '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f', // SNX
        '0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e', // YFI
        '0x111111111117dc0aa78b770fa6a738034120c302', // 1INCH
        '0xdf5e0e81dff6faf3a7e52ba697820c5e32d806a8', // yCurv
        '0x956f47f50a910163d8bf957cf5846d573e7f87ca', // FEI
        '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0', // MATIC
        '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', // AAVE
        '0xfe2e637202056d30016725477c5da089ab0a043a', // sETH2
        '0x0000000000000000000000000000000000000000', // Native ETH
      ],
      tokenOverrides: [
        {
          address: Address.fromString('0xe0b7927c4af23765cb51314a0e0521a9645f0e2a'),
          symbol: 'DGD',
          name: 'DGD',
          decimals: BigInt.fromI32(9),
        },
        {
          address: Address.fromString('0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9'),
          symbol: 'AAVE',
          name: 'Aave Token',
          decimals: BigInt.fromI32(18),
        },
        {
          address: Address.fromString('0xeb9951021698b42e4399f9cbb6267aa35f82d59d'),
          symbol: 'LIF',
          name: 'Lif',
          decimals: BigInt.fromI32(18),
        },
        {
          address: Address.fromString('0xbdeb4b83251fb146687fa19d1c660f99411eefe3'),
          symbol: 'SVD',
          name: 'savedroid',
          decimals: BigInt.fromI32(18),
        },
        {
          address: Address.fromString('0xbb9bc244d798123fde783fcc1c72d3bb8c189413'),
          symbol: 'TheDAO',
          name: 'TheDAO',
          decimals: BigInt.fromI32(16),
        },
        {
          address: Address.fromString('0x38c6a68304cdefb9bec48bbfaaba5c5b47818bb2'),
          symbol: 'HPB',
          name: 'HPBCoin',
          decimals: BigInt.fromI32(18),
        },
      ],
      poolMappings: [],
      poolsToSkip: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: BigInt.fromI32(18),
      },
    }
  } else if (selectedNetwork == BLAST_MAINNET_NETWORK_NAME) {
    return {
      poolManagerAddress: '0x1631559198a9e474033433b2958dabc135ab6446',
      stablecoinWrappedNativePoolId: '0x83e7c9f12348a95a5fe02c8af7074dd52defd1e108e19e51234c49da56d7c635', // https://blastscan.io/tx/0x96ecf330532a794388405835ba7cc6687f281d3e44dee502fb89dc8d789fdf33
      stablecoinIsToken0: true,
      wrappedNativeAddress: '0x4300000000000000000000000000000000000004', // WETH
      minimumNativeLocked: BigDecimal.fromString('1'),
      stablecoinAddresses: [
        '0x4300000000000000000000000000000000000003', // USDB
      ],
      whitelistTokens: [
        '0x4300000000000000000000000000000000000004', // WETH
        '0x4300000000000000000000000000000000000003', // USDB
        '0x0000000000000000000000000000000000000000', // Native ETH
      ],
      tokenOverrides: [],
      poolsToSkip: [],
      poolMappings: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: BigInt.fromI32(18),
      },
    }
  } else if (selectedNetwork == UNICHAIN_MAINNET_NETWORK_NAME) {
    return {
      poolManagerAddress: '0x1f98400000000000000000000000000000000004',
      stablecoinWrappedNativePoolId: '0x25939956ef14a098d95051d86c75890cfd623a9eeba055e46d8dd9135980b37c',
      stablecoinIsToken0: false,
      wrappedNativeAddress: '0x0000000000000000000000000000000000000000', // Native ETH
      minimumNativeLocked: BigDecimal.fromString('1'),
      stablecoinAddresses: [
        '0x078d782b760474a361dda0af3839290b0ef57ad6', // USDC
        '0x20cab320a855b39f724131c69424240519573f81', // DAI
      ],
      whitelistTokens: [
        '0x4200000000000000000000000000000000000006', // WETH
        '0x078d782b760474a361dda0af3839290b0ef57ad6', // USDC
        '0x20cab320a855b39f724131c69424240519573f81', // DAI
        '0x0000000000000000000000000000000000000000', // Native ETH
      ],
      tokenOverrides: [],
      poolsToSkip: [],
      poolMappings: [],
      nativeTokenDetails: {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: BigInt.fromI32(18),
      },
    }
  } else {
    throw new Error('Unsupported Network')
  }
}
