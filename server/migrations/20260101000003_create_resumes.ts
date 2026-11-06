import type { Knex } from 'knex';

/** 3. 简历版本（命中率由 apps 实时算，不落库） */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('resumes', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('user_id').unsigned().notNullable();
    table.string('name', 120).notNullable();
    table.string('target_role', 120).notNullable().defaultTo('');
    table.boolean('is_primary').notNullable().defaultTo(false);
    table.timestamp('deleted_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['user_id'], 'idx_resumes_user');
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('resumes');
}
