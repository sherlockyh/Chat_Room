-- AlterTable
ALTER TABLE `chatroom` ADD COLUMN `direct_key` VARCHAR(50) NULL;

-- AlterTable
ALTER TABLE `chat_history` ADD COLUMN `client_message_id` VARCHAR(36) NULL,
    ADD COLUMN `file_name` VARCHAR(255) NULL,
    ADD COLUMN `file_size` INTEGER NULL,
    ADD COLUMN `mime_type` VARCHAR(100) NULL,
    ADD COLUMN `object_key` VARCHAR(255) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `chatroom_direct_key_key` ON `chatroom`(`direct_key`);

-- CreateIndex
CREATE UNIQUE INDEX `chat_history_sender_id_client_message_id_key` ON `chat_history`(`sender_id`, `client_message_id`);
