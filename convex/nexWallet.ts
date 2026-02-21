"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";

export const walletAction = action({
  args: {
    orgId: v.string(),
    action: v.string(),
    params: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, { orgId, action: walletOp, params, secret }) => {
    // 1. Verify secret (hash-compare like verifySecret)
    const secretDoc = await ctx.runQuery(internal.lib.getSecret);
    if (!secretDoc) throw new Error("Unauthorized");
    const encoder = new TextEncoder();
    const data = encoder.encode(secret);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map((b: number) => b.toString(16).padStart(2, "0")).join("");
    if (secretDoc.value !== hash) throw new Error("Unauthorized");

    // 2. Load CDP keys from keys table
    const cdpKeyName = await ctx.runQuery(internal.lib.getKey, { name: "CDP_API_KEY_NAME_" + orgId });
    const cdpKeyPrivate = await ctx.runQuery(internal.lib.getKey, { name: "CDP_API_KEY_PRIVATE_" + orgId });
    if (!cdpKeyName || !cdpKeyPrivate) throw new Error("CDP API keys not configured — store CDP_API_KEY_NAME_<orgId> and CDP_API_KEY_PRIVATE_<orgId> in keys table");

    // 3. Load wallet data
    const wallet = await ctx.runQuery(api.nex.walletByOrg, { orgId });
    if (!wallet) throw new Error("No wallet configured for org");

    // 4. Initialize AgentKit
    const { AgentKit, CdpWalletProvider } = require("@coinbase/agentkit");

    const walletProvider = await CdpWalletProvider.configureWithWallet({
      apiKeyName: cdpKeyName.value,
      apiKeyPrivateKey: cdpKeyPrivate.value,
      networkId: wallet.network,
      walletData: wallet.walletData,
    });

    const agentKit = await AgentKit.from({ walletProvider });

    // 5. Check guardrails before signing operations
    const parsedParams = JSON.parse(params);
    if (wallet.guardrails && (walletOp === "send" || walletOp === "trade")) {
      const rails = JSON.parse(wallet.guardrails);
      if (rails.maxPerTx && parsedParams.amount && Number(parsedParams.amount) > Number(rails.maxPerTx)) {
        throw new Error("Exceeds per-transaction limit of " + rails.maxPerTx);
      }
    }

    // 6. Execute action
    const actions = agentKit.getActions();
    let result: unknown;

    if (walletOp === "balance") {
      const getDetails = actions.find((a: { name: string }) => a.name === "get_wallet_details");
      if (!getDetails) throw new Error("get_wallet_details action not found");
      result = await getDetails.invoke({});
    } else if (walletOp === "send") {
      const transfer = actions.find((a: { name: string }) => a.name === "native_transfer" || a.name === "transfer");
      if (!transfer) throw new Error("transfer action not found");
      result = await transfer.invoke(parsedParams);
    } else if (walletOp === "trade") {
      const trade = actions.find((a: { name: string }) => a.name === "trade");
      if (!trade) throw new Error("trade action not found");
      result = await trade.invoke(parsedParams);
    } else if (walletOp === "export") {
      result = await walletProvider.exportWallet();
    } else {
      throw new Error("Unknown wallet action: " + walletOp);
    }

    // 7. Update wallet data (wallet may have new state after tx)
    const exportedData = await walletProvider.exportWallet();
    await ctx.runMutation(api.nex.configureWallet, {
      orgId,
      network: wallet.network,
      address: wallet.address,
      walletData: JSON.stringify(exportedData),
      secret,
    });

    return JSON.stringify(result);
  },
});
