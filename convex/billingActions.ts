"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;
const TRANSFER_EVENT_SIGNATURE =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const verifyUsdcTx = action({
  args: {
    txHash: v.string(),
    expectedRecipient: v.string(),
    minAmount: v.string(),
  },
  handler: async (_ctx, { txHash, expectedRecipient, minAmount }) => {
    const { createPublicClient, http, formatUnits } = await import("viem");
    const { base } = await import("viem/chains");

    const client = createPublicClient({
      chain: base,
      transport: http(),
    });

    const receipt = await client.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    if (receipt.status !== "success") {
      throw new Error("Transaction failed on-chain");
    }

    const transferLog = receipt.logs.find(
      (log) =>
        log.address.toLowerCase() === USDC_ADDRESS.toLowerCase() &&
        log.topics[0] === TRANSFER_EVENT_SIGNATURE
    );

    if (!transferLog) {
      throw new Error("No USDC transfer found in transaction");
    }

    const to = "0x" + transferLog.topics[2]!.slice(26);
    if (to.toLowerCase() !== expectedRecipient.toLowerCase()) {
      throw new Error(`Recipient mismatch: expected ${expectedRecipient}, got ${to}`);
    }

    const amount = BigInt(transferLog.data);
    const amountFormatted = formatUnits(amount, USDC_DECIMALS);
    if (parseFloat(amountFormatted) < parseFloat(minAmount)) {
      throw new Error(`Amount too low: ${amountFormatted} < ${minAmount}`);
    }

    return {
      verified: true,
      amount: amountFormatted,
      from: "0x" + transferLog.topics[1]!.slice(26),
      to,
      blockNumber: Number(receipt.blockNumber),
    };
  },
});
