-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('BUY', 'SELL', 'MINT', 'BURN', 'PAYOUT');

-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('PLATFORM_MINT', 'P2P_TRADE', 'MARKET_RESOLUTION');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'REFUND');

-- CreateEnum
CREATE TYPE "WalletTransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "P2POrderType" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "P2POrderStatus" AS ENUM ('PENDING', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "balance" DECIMAL(18,8) NOT NULL DEFAULT 0,
ADD COLUMN     "locked_balance" DECIMAL(18,8) NOT NULL DEFAULT 0,
ADD COLUMN     "minimum_balance" DECIMAL(18,8) NOT NULL DEFAULT 10,
ADD COLUMN     "p2p_escrow_balance" DECIMAL(18,8) NOT NULL DEFAULT 0,
ADD COLUMN     "total_deposited" DECIMAL(18,8) NOT NULL DEFAULT 0,
ADD COLUMN     "total_withdrawn" DECIMAL(18,8) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "permissions" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "image_url" TEXT,
    "resolution_date" TIMESTAMP(3) NOT NULL,
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_answer" BOOLEAN,
    "constant_value" DECIMAL(18,8) NOT NULL,
    "total_yes_tokens" INTEGER NOT NULL,
    "total_no_tokens" INTEGER NOT NULL,
    "current_yes_price" DECIMAL(18,8) NOT NULL,
    "current_no_price" DECIMAL(18,8) NOT NULL,
    "initial_token_supply" INTEGER NOT NULL,
    "initial_token_price" DECIMAL(18,8) NOT NULL,
    "collected_fees" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "platform_fee_rate" DECIMAL(5,4) NOT NULL DEFAULT 0.025,
    "status" "QuestionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yes_tokens" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "current_price" DECIMAL(18,8) NOT NULL,
    "available_supply" INTEGER NOT NULL,
    "circulating_supply" INTEGER NOT NULL,
    "total_volume" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "last_trade_price" DECIMAL(18,8),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "yes_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "no_tokens" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "current_price" DECIMAL(18,8) NOT NULL,
    "available_supply" INTEGER NOT NULL,
    "circulating_supply" INTEGER NOT NULL,
    "total_volume" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "last_trade_price" DECIMAL(18,8),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "no_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "yes_token_holdings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "average_buy_price" DECIMAL(18,8) NOT NULL,
    "total_invested" DECIMAL(18,8) NOT NULL,
    "available_for_sale" INTEGER NOT NULL DEFAULT 0,
    "locked_in_orders" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "yes_token_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "no_token_holdings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "average_buy_price" DECIMAL(18,8) NOT NULL,
    "total_invested" DECIMAL(18,8) NOT NULL,
    "available_for_sale" INTEGER NOT NULL DEFAULT 0,
    "locked_in_orders" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "no_token_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "p2p_orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "orderType" "P2POrderType" NOT NULL,
    "token_type" "TokenType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price_per_token" DECIMAL(18,8) NOT NULL,
    "total_amount" DECIMAL(18,8) NOT NULL,
    "status" "P2POrderStatus" NOT NULL DEFAULT 'PENDING',
    "filled_quantity" INTEGER NOT NULL DEFAULT 0,
    "remaining_quantity" INTEGER NOT NULL,
    "matched_order_id" TEXT,
    "executed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "p2p_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_resolutions" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "resolved_answer" BOOLEAN NOT NULL,
    "resolution_date" TIMESTAMP(3) NOT NULL,
    "total_pool_value" DECIMAL(18,8) NOT NULL,
    "platform_fee_collected" DECIMAL(18,8) NOT NULL,
    "winner_pool_value" DECIMAL(18,8) NOT NULL,
    "total_winner_tokens" INTEGER NOT NULL,
    "payout_per_token" DECIMAL(18,8) NOT NULL,
    "total_payouts_sent" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "market_resolution_id" TEXT NOT NULL,
    "token_quantity" INTEGER NOT NULL,
    "payout_amount" DECIMAL(18,8) NOT NULL,
    "payoutStatus" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amount" DECIMAL(18,8) NOT NULL,
    "payment_method" TEXT,
    "payment_id" TEXT,
    "status" "WalletTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "transaction_source" "TransactionSource" NOT NULL,
    "token_type" "TokenType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price_per_token" DECIMAL(18,8) NOT NULL,
    "total_amount" DECIMAL(18,8) NOT NULL,
    "p2p_order_id" TEXT,
    "counterparty_id" TEXT,
    "platform_fee" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
    "tx_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "yes_tokens_question_id_key" ON "yes_tokens"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "no_tokens_question_id_key" ON "no_tokens"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "yes_token_holdings_user_id_question_id_key" ON "yes_token_holdings"("user_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "no_token_holdings_user_id_question_id_key" ON "no_token_holdings"("user_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "market_resolutions_question_id_key" ON "market_resolutions"("question_id");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yes_tokens" ADD CONSTRAINT "yes_tokens_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "no_tokens" ADD CONSTRAINT "no_tokens_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yes_token_holdings" ADD CONSTRAINT "yes_token_holdings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yes_token_holdings" ADD CONSTRAINT "yes_token_holding_question_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "yes_token_holdings" ADD CONSTRAINT "yes_token_holding_yes_token_fkey" FOREIGN KEY ("question_id") REFERENCES "yes_tokens"("question_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "no_token_holdings" ADD CONSTRAINT "no_token_holdings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "no_token_holdings" ADD CONSTRAINT "no_token_holding_question_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "no_token_holdings" ADD CONSTRAINT "no_token_holding_no_token_fkey" FOREIGN KEY ("question_id") REFERENCES "no_tokens"("question_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p2p_orders" ADD CONSTRAINT "p2p_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "p2p_orders" ADD CONSTRAINT "p2p_orders_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_resolutions" ADD CONSTRAINT "market_resolutions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_market_resolution_id_fkey" FOREIGN KEY ("market_resolution_id") REFERENCES "market_resolutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_p2p_order_id_fkey" FOREIGN KEY ("p2p_order_id") REFERENCES "p2p_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
