import type { Knex } from 'knex';

/** 12. 路线图阶段（seed 5 阶段） */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('roadmap_stages', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('user_id').unsigned().notNullable();
    table.tinyint('stage_order').unsigned().notNullable();
    table.string('title', 64).notNullable();
    table.text('description').notNullable();
    table.date('expected_done_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['user_id', 'stage_order'], 'uq_stage');
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('roadmap_stages');
}
