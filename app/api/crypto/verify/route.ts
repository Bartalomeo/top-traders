import { NextRequest, NextResponse } from 'next/server';
import { getPayment, updatePaymentStatus, getUser, setUser } from '@/lib/redis';
import { verifyUSDTTransfer } from '@/lib/gnosis';

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

    // Already confirmed
    if (payment.status === 'confirmed') {
      return NextResponse.json({ status: 'confirmed' });
    }

    // Verify the on-chain transaction
    const result = await verifyUSDTTransfer(txHash, payment.amount, payment.chain);

    if (result.valid) {
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

      return NextResponse.json({
        status: 'confirmed',
        explorerUrl: result.explorerUrl,
        confirmations: result.confirmations,
      });
    }

    return NextResponse.json({
      status: 'pending',
      error: result.error || 'Transaction not verified',
      confirmations: result.confirmations,
    });
  } catch (err: any) {
    console.error('Verify error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
