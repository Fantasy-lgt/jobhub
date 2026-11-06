import type { Knex } from 'knex';

/** 13. 路线图任务 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('roadmap_tasks', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('user_id').unsigned().notNullable();
    table.bigInteger('stage_id').unsigned().notNullable();
    table.string('title', 255).notNullable();
    table.boolean('done').notNullable().defaultTo(false);
    table.dateTime('done_at').nullable();
    table.integer('sort_order').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['stage_id'], 'idx_tasks_stage');
    table.foreign('stage_id').references('roadmap_stages.id').onDelete('CASCADE');
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('roadmap_tasks');
}
