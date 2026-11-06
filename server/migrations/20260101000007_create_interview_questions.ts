import type { Knex } from 'knex';

/** 7. 面试题目（机检结果落库：STAR/量化/雷区/超长） */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('interview_questions', (table) => {
    table.bigIncrements('id').unsigned().primary();
    table.bigInteger('interview_id').unsigned().notNullable();
    table.bigInteger('user_id').unsigned().notNullable();
    table.text('question').notNullable();
    table.text('my_answer').notNullable();
    table.text('better_answer').notNullable();
    table.string('tag', 32).notNullable().defaultTo('专业题');
    table.text('s_context').nullable(); // STAR·S
    table.text('t_task').nullable(); // STAR·T
    table.text('a_action').nullable(); // STAR·A
    table.text('r_result').nullable(); // STAR·R
    table.boolean('has_number').notNullable().defaultTo(false); // 量化
    table.json('weakness_codes').notNullable(); // ["W1","W3"]
    table.boolean('is_overlong').notNullable().defaultTo(false); // >300 字
    table.integer('sort_order').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['interview_id'], 'idx_questions_interview');
    table.index(['user_id'], 'idx_questions_user');
    table.foreign('interview_id').references('interviews.id').onDelete('CASCADE');
    table.foreign('user_id').references('users.id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('interview_questions');
}
