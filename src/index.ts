import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
  ACTIONS_CORS_HEADERS,
  createPostResponse,
} from "@solana/actions";
import {
  clusterApiUrl,
  Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import * as anchor from "@coral-xyz/anchor";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use(
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "Accept-Encoding"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

async function validateQueryParams(requestUrl) {
  const connection = new Connection(clusterApiUrl("mainnet-beta"));
  let squad = new PublicKey("Gr5FaqkMmypxUJfADQsoYN3moknprc5LzMF2qh3SiP8m");
  let action = requestUrl.searchParams.get("action");
  let transactionIndex = 1;

  try {
    if (requestUrl.searchParams.get("squad")) {
      squad = new PublicKey(requestUrl.searchParams.get("squad"));
    }
  } catch (err) {
    throw err;
  }

  const multisigInfo = await multisig.accounts.Multisig.fromAccountAddress(
    connection,
    squad,
  );

  transactionIndex = Number(multisigInfo.transactionIndex);

  try {
    if (requestUrl.searchParams.get("tx")) {
      transactionIndex = Number(requestUrl.searchParams.get("tx"));
    }
  } catch (err) {
    throw err;
  }

  return {
    squad,
    transactionIndex,
    action,
  };
}

app.get("/", async (c) => {
  try {
    const requestUrl = new URL(c.req.url);
    const { squad, transactionIndex } = await validateQueryParams(requestUrl);

    const baseHref = new URL(
      `/api/action/approve?squad=${squad}&tx=${transactionIndex}`,
      requestUrl.origin,
    ).toString();

    const vault = multisig.getVaultPda({
      multisigPda: new PublicKey(squad),
      index: 0,
    });

    const multisigInfo = await fetch(
      `https://v4-api.squads.so/multisig/${vault[0].toString()}`,
    ).then((res) => res.json());

    const meta = multisigInfo.metadata;

    const payload = {
      title: `Approve ${meta.name} Transaction`,
      icon: "https://ucarecdn.com/7aa46c85-08a4-4bc7-9376-88ec48bb1f43/-/preview/880x864/-/quality/smart/-/format/auto/",
      description: `Cast your vote on transaction #${transactionIndex} for ${meta.name}`,
      label: "SquadsTransaction",
      links: {
        actions: [
          { label: "Approve", href: `${baseHref}&action=Approve` },
          { label: "Reject", href: `${baseHref}&action=Reject` },
          {
            label: "Approve & Execute",
            href: `${baseHref}&action=ApproveExecute`,
          },
        ],
      },
    };

    return c.json(payload, 200, ACTIONS_CORS_HEADERS);
  } catch (err) {
    console.log(err);
    return c.json({ error: "An error occurred" }, 500, ACTIONS_CORS_HEADERS);
  }
});

app.post("/", async (c) => {
  try {
    const requestUrl = new URL(c.req.url);
    let { squad, transactionIndex, action } =
      await validateQueryParams(requestUrl);

    const body = await c.req.json();

    let account;
    try {
      account = new PublicKey(body.account);
    } catch (err) {
      return c.text('Invalid "account" provided', 400, ACTIONS_CORS_HEADERS);
    }

    const connection = new Connection(clusterApiUrl("mainnet-beta"));
    const vault = multisig.getVaultPda({
      multisigPda: new PublicKey(squad),
      index: 0,
    });

    const multisigInfo = await fetch(
      `https://v4-api.squads.so/multisig/${vault[0].toString()}`,
    ).then((res) => res.json());

    const meta = multisigInfo.metadata;

    const transaction = new Transaction();
    transaction.feePayer = account;

    if (action === "Approve") {
      transaction.add(
        await multisig.instructions.proposalApprove({
          multisigPda: squad,
          transactionIndex: BigInt(transactionIndex),
          member: account,
          programId: multisig.PROGRAM_ID,
        }),
      );
    } else if (action === "Reject") {
      transaction.add(
        await multisig.instructions.proposalReject({
          multisigPda: squad,
          transactionIndex: BigInt(transactionIndex),
          member: account,
          programId: multisig.PROGRAM_ID,
        }),
      );
    } else if (action === "ApproveExecute") {
      transaction.add(
        await multisig.instructions.proposalApprove({
          multisigPda: squad,
          transactionIndex: BigInt(transactionIndex),
          member: account,
          programId: multisig.PROGRAM_ID,
        }),
        (
          await multisig.instructions.vaultTransactionExecute({
            connection,
            multisigPda: squad,
            transactionIndex: BigInt(transactionIndex),
            member: account,
            programId: multisig.PROGRAM_ID,
          })
        ).instruction,
      );
    } else if (action === "Simulate") {
      const [transaction] = await PublicKey.findProgramAddressSync(
        [
          Buffer.from("multisig"),
          new PublicKey(squad).toBuffer(),
          Buffer.from("transaction"),
          new anchor.BN(transactionIndex).toArrayLike(Buffer, "le", 8),
        ],
        multisig.PROGRAM_ID,
      );

      const transactionInfo =
        await multisig.accounts.VaultTransaction.fromAccountAddress(
          connection,
          transaction,
        );
      const message = transactionInfo.serialize();

      return c.redirect(`https://explorer.solana.com/tx/inspector/${message}`);
    } else {
      return c.text(
        "No supported action was selected",
        400,
        ACTIONS_CORS_HEADERS,
      );
    }

    transaction.recentBlockhash = (
      await connection.getLatestBlockhash()
    ).blockhash;

    const payload = await createPostResponse({
      fields: {
        transaction,
        message: `${action === "Approve"
            ? "Approved"
            : action === "Reject"
              ? "Rejected"
              : "Approved and executed"
          } transaction #${transactionIndex} for ${meta.name}`,
      },
    });

    return c.json(payload, 200, ACTIONS_CORS_HEADERS);
  } catch (err) {
    console.log(err);
    return c.json({ error: "An error occurred" }, 500, ACTIONS_CORS_HEADERS);
  }
});

export default app;
