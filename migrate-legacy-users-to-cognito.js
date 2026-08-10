/**
 * Миграция легаси-пользователей (заведённых до Cognito) в User Pool.
 *
 * ЗАЧЕМ: такие юзеры есть в таблице users, но их нет в Cognito. Для них не
 * работает ни логин (InitiateAuth → UserNotFound), ни восстановление пароля
 * (ForgotPassword молча возвращает «код отправлен», письма нет).
 *
 * ЧТО ДЕЛАЕТ для каждого пользователя без записи в пуле:
 *   1. AdminCreateUser с email_verified=true и MessageAction=SUPPRESS
 *      (без SUPPRESS Cognito разошлёт всем приглашения с временным паролем)
 *   2. AdminSetUserPassword со случайным Permanent-паролем. Обязательный шаг:
 *      после AdminCreateUser юзер в статусе FORCE_CHANGE_PASSWORD, а в нём
 *      ForgotPassword падает с NotAuthorizedException. Пароль никому не
 *      сообщается — пользователь задаёт свой через /password-recovery.
 *   3. Прописывает полученный Cognito sub в users.cognito_sub
 *
 * ВАЖНО: users.user_id НЕ трогается. CognitoAuthGuard ищет юзера по
 * cognito_sub и возвращает исходный user_id, поэтому все существующие FK
 * (организации, проекты, карточки) остаются на месте.
 *
 * Скрипт идемпотентный: повторный запуск чинит только расхождения.
 *
 * ЗАПУСК:
 *   node migrate-legacy-users-to-cognito.js            # dry-run, ничего не меняет
 *   node migrate-legacy-users-to-cognito.js --apply    # выполнить
 *
 * ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COGNITO_USER_POOL_ID,
 *      COGNITO_REGION + AWS-креды (admin-операции требуют IAM, в отличие
 *      от ForgotPassword).
 */
require('dotenv').config();

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const APPLY = process.argv.includes('--apply');
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

const cognito = new CognitoIdentityProviderClient({
  region: process.env.COGNITO_REGION || 'eu-central-1',
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

/** Пароль-заглушка под политику пула: строчные, заглавные, цифра, спецсимвол */
function randomPassword() {
  return `Aa1!${crypto.randomBytes(24).toString('base64url')}`;
}

function subOf(attributes = []) {
  return attributes.find((a) => a.Name === 'sub')?.Value || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findInCognito(email) {
  try {
    const res = await cognito.send(
      new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: email }),
    );
    return { sub: subOf(res.UserAttributes), status: res.UserStatus };
  } catch (error) {
    if (error.name === 'UserNotFoundException') return null;
    throw error;
  }
}

async function createInCognito(email) {
  const res = await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
    }),
  );
  return subOf(res.User?.Attributes);
}

/** Выводит юзера из FORCE_CHANGE_PASSWORD в CONFIRMED, иначе ForgotPassword не сработает */
async function makeResettable(email) {
  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      Password: randomPassword(),
      Permanent: true,
    }),
  );
}

async function main() {
  if (!USER_POOL_ID) throw new Error('COGNITO_USER_POOL_ID не задан');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY не задан');
  }

  console.log(APPLY ? '=== РЕЖИМ: APPLY ===' : '=== РЕЖИМ: DRY-RUN (ничего не меняется) ===');
  console.log('User Pool:', USER_POOL_ID, '\n');

  const { data: users, error } = await supabase
    .from('users')
    .select('user_id, email, username, cognito_sub');

  if (error) throw new Error(`Не удалось прочитать users: ${error.message}`);

  const stats = { ok: 0, created: 0, relinked: 0, skipped: 0, failed: 0 };

  for (const user of users) {
    if (!user.email) {
      console.warn(`SKIP  user_id=${user.user_id} — нет email`);
      stats.skipped++;
      continue;
    }

    try {
      let existing = await findInCognito(user.email);

      if (!existing) {
        console.log(`СОЗДАТЬ  ${user.email}`);
        if (APPLY) {
          const sub = await createInCognito(user.email);
          await makeResettable(user.email);
          existing = { sub, status: 'CONFIRMED' };
        } else {
          stats.created++;
          continue;
        }
        stats.created++;
      } else if (existing.status === 'FORCE_CHANGE_PASSWORD') {
        // Заведён ранее через AdminCreateUser и завис в непригодном статусе
        console.log(`РАЗБЛОКИРОВАТЬ  ${user.email} (статус ${existing.status})`);
        if (APPLY) await makeResettable(user.email);
      }

      if (existing.sub && existing.sub !== user.cognito_sub) {
        console.log(
          `  ПРИВЯЗКА cognito_sub: ${user.cognito_sub || 'null'} → ${existing.sub}`,
        );
        if (APPLY) {
          const { error: updateError } = await supabase
            .from('users')
            .update({ cognito_sub: existing.sub })
            .eq('user_id', user.user_id);

          if (updateError) throw new Error(`update users: ${updateError.message}`);
        }
        stats.relinked++;
      } else {
        stats.ok++;
      }
    } catch (err) {
      console.error(`FAIL  ${user.email}: ${err.name || ''} ${err.message}`);
      stats.failed++;
    }

    await sleep(120); // бережём квоты admin-API Cognito
  }

  console.log('\n=== ИТОГО ===');
  console.log('уже в порядке      :', stats.ok);
  console.log('создано в Cognito  :', stats.created);
  console.log('перепривязано sub  :', stats.relinked);
  console.log('пропущено (no email):', stats.skipped);
  console.log('ошибок             :', stats.failed);

  if (!APPLY) console.log('\nЭто был dry-run. Для применения: --apply');
}

main().catch((err) => {
  console.error('\nСкрипт упал:', err);
  process.exit(1);
});
