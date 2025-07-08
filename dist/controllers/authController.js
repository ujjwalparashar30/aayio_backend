"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleWebhookCallback = exports.syncUser = void 0;
const webhooks_1 = require("@clerk/express/webhooks");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const syncUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Syncing user with Clerk ID:", req.body.clerkId);
    res.status(200).json({ message: "Sync user endpoint" });
});
exports.syncUser = syncUser;
const handleWebhookCallback = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("=== WEBHOOK RECEIVED ===");
        console.log("Headers:", req.headers);
        console.log("Body:", req.body);
        const evt = yield (0, webhooks_1.verifyWebhook)(req);
        const eventType = evt.type;
        console.log(`Received webhook with event type: ${eventType}`);
        console.log("Webhook payload:", evt.data);
        // Handle different event types
        switch (eventType) {
            case 'user.created':
                yield handleUserCreated(evt.data);
                break;
            case 'user.updated':
                yield handleUserUpdated(evt.data);
                break;
            case 'user.deleted':
                yield handleUserDeleted(evt.data);
                break;
            default:
                console.log(`Unhandled event type: ${eventType}`);
        }
        res.status(200).send("Webhook processed successfully");
        return;
    }
    catch (err) {
        console.error("Error processing webhook:", err);
        res.status(400).send("Error processing webhook");
        return;
    }
});
exports.handleWebhookCallback = handleWebhookCallback;
// Handle user creation
function handleUserCreated(userData) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        console.log('=== USER CREATED EVENT ===');
        try {
            // Extract email from the email_addresses array
            const primaryEmail = ((_a = userData.email_addresses) === null || _a === void 0 ? void 0 : _a.find((email) => email.id === userData.primary_email_address_id)) || ((_b = userData.email_addresses) === null || _b === void 0 ? void 0 : _b[0]);
            const userPayload = {
                clerkUserId: userData.id,
                email: (primaryEmail === null || primaryEmail === void 0 ? void 0 : primaryEmail.email_address) || '',
                firstName: userData.first_name || null,
                lastName: userData.last_name || null,
                imageUrl: userData.image_url || userData.profile_image_url || null,
                createdAt: new Date(userData.created_at),
                updatedAt: new Date(userData.updated_at)
            };
            console.log('Creating user with payload:', userPayload);
            // Create user in database
            const newUser = yield prisma.user.create({
                data: userPayload
            });
            console.log('User created successfully:', newUser.id);
        }
        catch (error) {
            console.error('Error creating user:', error);
            throw error;
        }
    });
}
// Handle user updates
function handleUserUpdated(userData) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        console.log('=== USER UPDATED EVENT ===');
        try {
            // Extract email from the email_addresses array
            const primaryEmail = ((_a = userData.email_addresses) === null || _a === void 0 ? void 0 : _a.find((email) => email.id === userData.primary_email_address_id)) || ((_b = userData.email_addresses) === null || _b === void 0 ? void 0 : _b[0]);
            const updatePayload = {
                email: (primaryEmail === null || primaryEmail === void 0 ? void 0 : primaryEmail.email_address) || '',
                firstName: userData.first_name || null,
                lastName: userData.last_name || null,
                imageUrl: userData.image_url || userData.profile_image_url || null,
                updatedAt: new Date(userData.updated_at)
            };
            console.log('Updating user with payload:', updatePayload);
            // Update user in database
            const updatedUser = yield prisma.user.update({
                where: { clerkUserId: userData.id },
                data: updatePayload
            });
            console.log('User updated successfully:', updatedUser.id);
        }
        catch (error) {
            console.error('Error updating user:', error);
            throw error;
        }
    });
}
// Handle user deletion
function handleUserDeleted(userData) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('=== USER DELETED EVENT ===');
        try {
            // Soft delete - update deletedAt timestamp
            const deletedUser = yield prisma.user.update({
                where: { clerkUserId: userData.id },
                data: {
                    deletedAt: new Date(),
                    updatedAt: new Date()
                }
            });
            console.log('User deleted successfully:', deletedUser.id);
        }
        catch (error) {
            console.error('Error deleting user:', error);
            throw error;
        }
    });
}
