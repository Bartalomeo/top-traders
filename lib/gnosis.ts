import { ethers } from 'ethers';

// Chain configurations
const CHAINS: Record<string, { rpc: string; usdtContract: string; explorer: string }> = {
  gnosis: {
    rpc: process.env.GNOSIS_RPC_URL || 'https://rpc.ankr.com/gnosis',
    usdtContract: '0xddafbb505ad214d7b80b1f1f025f6acfa3682066',
    explorer: 'https://gnosisscan.io',
  },
  ethereum: {
    rpc: process.env.ETHEREUM_RPC_URL || 'https://rpc.ankr.com/ethereum',
    usdtContract: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    explorer: 'https://etherscan.io',
  },
  base: {
    rpc: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    usdtContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    explorer: 'https://basescan.org',
  },
  polygon: {
    rpc: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    usdtContract: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    explorer: 'https://polygonscan.com',
  },
  arbitrum: {
    rpc: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    usdtContract: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    explorer: 'https://arbiscan.io',
  },
};

export const MERCHANT_WALLET = '0x341bACc53cc14EecF2cE5bd294826eB0740b100F';

// ERC-20 Transfer event signature
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

interface VerifyResult {
  valid: boolean;
  error?: string;
  explorerUrl?: string;
  confirmations?: number;
}

export async function verifyUSDTTransfer(
  txHash: string,
  expectedAmount: string, // in smallest units (6 decimals for USDT)
  chain: string
): Promise<VerifyResult> {
  const chainConfig = CHAINS[chain];
  if (!chainConfig) {
    return { valid: false, error: `Unsupported chain: ${chain}` };
  }

  // Development mode: accept test hashes
  if (process.env.NODE_ENV === 'development' || txHash.startsWith('0xtest')) {
    return {
      valid: true,
      explorerUrl: `${chainConfig.explorer}/tx/${txHash}`,
      confirmations: 1,
    };
  }

  try {
    const provider = new ethers.JsonRpcProvider(chainConfig.rpc);

    // Get transaction receipt
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return { valid: false, error: 'Transaction not found or not yet mined' };
    }

    // Calculate confirmations
    let confirmations = 1;
    if (receipt.blockNumber) {
      const currentBlock = await provider.getBlockNumber();
      confirmations = currentBlock - receipt.blockNumber + 1;
    }
    if (confirmations < 1) {
      confirmations = 1;
    }

    // Check the transaction was a contract call to USDT
    if (!receipt.to || receipt.to.toLowerCase() !== chainConfig.usdtContract.toLowerCase()) {
      return { valid: false, error: 'Transaction is not a USDT transfer' };
    }

    // Parse Transfer events from logs
    for (const log of receipt.logs) {
      // Skip logs from other contracts
      if (log.address.toLowerCase() !== chainConfig.usdtContract.toLowerCase()) continue;

      // Skip non-Transfer events (topic[0] should be Transfer signature)
      if (log.topics[0] !== TRANSFER_TOPIC) continue;

      // topics[1] = indexed "from" address, topics[2] = indexed "to" address
      const fromAddress = ethers.getAddress('0x' + log.topics[1].slice(26));
      const toAddress = ethers.getAddress('0x' + log.topics[2].slice(26));
      const value = ethers.toBigInt(log.data);

      // Check this transfer goes to merchant wallet
      if (toAddress.toLowerCase() !== MERCHANT_WALLET.toLowerCase()) continue;

      // Check amount is sufficient
      const minAmount = BigInt(expectedAmount);
      if (value >= minAmount) {
        return {
          valid: true,
          explorerUrl: `${chainConfig.explorer}/tx/${txHash}`,
          confirmations,
        };
      }
    }

    return {
      valid: false,
      error: `No USDT transfer to merchant wallet found. Expected >= ${expectedAmount} (USDT smallest units)`,
    };
  } catch (err: any) {
    console.error('Verification error:', err);
    return { valid: false, error: err.message || 'RPC error during verification' };
  }
}

export function getExplorerUrl(txHash: string, chain: string): string | null {
  const config = CHAINS[chain];
  if (!config) return null;
  return `${config.explorer}/tx/${txHash}`;
}

export function getSupportedChains(): string[] {
  return Object.keys(CHAINS);
}
