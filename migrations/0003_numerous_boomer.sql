CREATE TABLE `exercise_set` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_id` text NOT NULL,
	`set_index` integer NOT NULL,
	`target_reps` integer,
	`target_weight` real,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercise`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `exercise_set_exercise_idx` ON `exercise_set` (`exercise_id`);--> statement-breakpoint
INSERT INTO `exercise_set` (`id`, `exercise_id`, `set_index`, `target_reps`, `target_weight`)
SELECT
	lower(hex(randomblob(16))),
	e.id,
	n.n,
	e.target_reps,
	e.target_weight
FROM `exercise` e
JOIN (
	WITH RECURSIVE cnt(n) AS (
		SELECT 0
		UNION ALL
		SELECT n + 1 FROM cnt WHERE n + 1 < 20
	)
	SELECT n FROM cnt
) n ON n.n < COALESCE(e.target_sets, 1)
WHERE e.target_sets IS NOT NULL OR e.target_reps IS NOT NULL OR e.target_weight IS NOT NULL;--> statement-breakpoint
ALTER TABLE `exercise` DROP COLUMN `target_sets`;--> statement-breakpoint
ALTER TABLE `exercise` DROP COLUMN `target_reps`;--> statement-breakpoint
ALTER TABLE `exercise` DROP COLUMN `target_weight`;
