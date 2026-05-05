import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { getPayment, updatePaymentStatus, getUser, setUser } from '@/lib/redis';

// In production, use proper blockchain RPC calls
// For demo, we simulate verification
async function verifyTransaction(txHash: string, expectedAmount: string, chain: string): Promise<boolean> {
  // Simulate verification delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  // In production, make actual RPC call:
  // const provider = new ethers.providers.JsonRpcProvider(getRPCUrl(chain));
  // const tx = await provider.getTransactionReceipt(txHash);
  // Check: tx.to === MERCHANT_WALLET, tx.value === expectedAmount, tx.confirmations > 0

  // For demo: any valid-looking tx hash works
  return txHash.startsWith('0x') && txHash.length === 66;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ref = searchParams.get('ref');
    const txHash = searchParams.get('txHash');

    if (!ref || !txHash) {
      return NextResponse.json({ error: 'Missing ref or txHash' }, { status: 400 });
    }

    const payment = await getPayment(ref);
    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // Check expiration
    if (new Date(payment.expiresAt) < new Date()) {
      await updatePaymentStatus(ref, 'expired');
      return NextResponse.json({ status: 'expired' });
    }

    // Verify transaction
    const isValid = await verifyTransaction(txHash, payment.amount, payment.chain);

    if (isValid) {
      await updatePaymentStatus(ref, 'confirmed', txHash);

      // Upgrade user subscription
      const user = await getUser(payment.userId);
      if (user) {
        const periodEnd = new Date();
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        user.subscription = {
          plan: payment.plan,
          status: 'active',
          currentPeriodEnd: periodEnd.toISOString(),
        };
        user.subscribed = true;
        await setUser(payment.userId, user);
      }

      return NextResponse.json({ status: 'confirmed' });
    }

    return NextResponse.json({
      status: 'pending',
      error: 'Transaction not found or not confirmed yet'
    });
  } catch (err: any) {
    console.error('Verify error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
