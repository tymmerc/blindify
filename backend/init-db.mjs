/**
 * Ancien script d'initialisation de la base : il ne fait plus rien que refuser.
 *
 * Il jouait backend/schema.sql (19 tables, aout 2026) avec son propre pool,
 * hors du garde-fou de config/databaseGuard.ts, sur le DATABASE_URL de
 * ../.env, c'est-a-dire la base de PROD quand on le lancait dans
 * /opt/blindify/backend. Relecture de #75 (C0), point M4.
 *
 * Le fichier reste : docker-compose.yml le monte dans
 * /docker-entrypoint-initdb.d du Postgres de la prod (l'image n'y execute que
 * les .sh et .sql, il n'y a jamais tourne).
 *
 * A la place :
 * - base de dev : bash tools/dev-db/dev-db.sh up (schema de la prod) ;
 * - base de test : npm run test:db ;
 * - structure de la prod : backend/db/schema.sql, tenu par tools/schema-snapshot.sh.
 */
console.error(
  "[init-db] script retire : il visait la base de ../.env avec un schema perime.\n" +
  "  base de dev  : bash tools/dev-db/dev-db.sh up\n" +
  "  base de test : npm run test:db"
);
process.exit(2);
