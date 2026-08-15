CREATE TABLE `assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`institution` text NOT NULL,
	`province` text NOT NULL,
	`assessor_name` text NOT NULL,
	`respondent_role` text NOT NULL,
	`position` text DEFAULT '' NOT NULL,
	`assessment_date` text NOT NULL,
	`topic_id` text NOT NULL,
	`topic_label` text NOT NULL,
	`agency_type` text,
	`rubric_version` text NOT NULL,
	`answers_json` text NOT NULL,
	`category_scores_json` text NOT NULL,
	`recommendations_json` text NOT NULL,
	`score_basis_points` integer NOT NULL,
	`grade` text NOT NULL,
	`verification_status` text DEFAULT 'self_reported' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessments_idempotency_key_idx` ON `assessments` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `assessments_province_topic_idx` ON `assessments` (`province`,`topic_id`);--> statement-breakpoint
CREATE INDEX `assessments_created_at_idx` ON `assessments` (`created_at`);