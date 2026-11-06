import type { Knex } from 'knex';

/** 8. AI 逐题分析（每题目一条，含任务状态用于续跑） */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('question_analyses', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('question_id').unsigned().notNullable();
    table.bigInteger('user_id').unsigned().notNullable();
    table.text('examine_point').notNullable();
    table.json('inferred_flags').notNullable(); // 标注「推断」的考察点
    table.text('keep_text').notNullable();
    table.text('rewrite_text').notNullable(); // 已通过反编造校验
    table.string('need_numbers', 500).notNullable().defaultTo('');
    table.string('model', 64).notNullable().defaultTo('deepseek-chat');
    table.string('status', 16).notNullable().defaultTo('pending'); // pending/running/done/failed
    table.string('error_msg', 500).notNullable().defaultTo('');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['question_id'], 'uq_analyses_question');
    table.index(['user_id'], 'idx_analyses_user');
    table.foreign('question_id').references('interview_questions.id').onDelete('CASCADE');
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('question_analyses');
}
