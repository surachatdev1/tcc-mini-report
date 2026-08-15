import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const assessments = sqliteTable("assessments", {
  id: text("id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull(),
  institution: text("institution").notNull(), province: text("province").notNull(),
  assessorName: text("assessor_name").notNull(), respondentRole: text("respondent_role").notNull(),
  position: text("position").notNull().default(""), assessmentDate: text("assessment_date").notNull(),
  topicId: text("topic_id").notNull(), topicLabel: text("topic_label").notNull(), agencyType: text("agency_type"),
  rubricVersion: text("rubric_version").notNull(), answersJson: text("answers_json").notNull(),
  categoryScoresJson: text("category_scores_json").notNull(), recommendationsJson: text("recommendations_json").notNull(),
  scoreBasisPoints: integer("score_basis_points").notNull(), grade: text("grade").notNull(),
  verificationStatus: text("verification_status").notNull().default("self_reported"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("assessments_idempotency_key_idx").on(table.idempotencyKey),
  index("assessments_province_topic_idx").on(table.province, table.topicId),
  index("assessments_created_at_idx").on(table.createdAt),
]);
