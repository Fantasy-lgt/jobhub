import type { Knex } from 'knex';

/** 9. 题目手动合并/拆分（不设 question 外键，应用层保证引用） */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('question_links', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('user_id').unsigned().notNullable();
    table.bigInteger('question_a_id').unsigned().notNullable();
    table.bigInteger('question_b_id').unsigned().notNullable();
    table.string('link_type', 8).notNullable(); // merge / split
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['user_id', 'question_a_id', 'question_b_id', 'link_type'], 'uq_link');
    table.index(['user_id'], 'idx_links_user');
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('question_links');
}
