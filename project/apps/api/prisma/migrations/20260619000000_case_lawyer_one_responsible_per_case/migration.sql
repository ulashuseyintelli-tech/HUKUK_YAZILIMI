-- PR-C (ASSIGN-4b-DB): "her dosyada TAM OLARAK 1 sorumlu avukat" DB-INVARIANT'i.
--
-- On kosullar (hepsi main'de):
--   * ASSIGN-4b (#223): runtime invariant (create/update/add/remove -> tam 1 isResponsible).
--   * #226: tek-seferlik drift onarim scripti (fix-case-lawyer-responsible-drift.ts).
--   * PR-A (#229): clear-before-set yazim sirasi (tx icinde asla gecici >1 true) + dormant
--     P2002->409 (toCaseLawyerConflict, target substring 'one_responsible_per_case').
--   * Census: local hukuk_db (tek gercek veri; staging/prod YOK) -> multi_resp=0 dogrulandi
--     (96 dosya, drift=0) -> bu kismi tekil index GUVENLE yaratilir.
--
-- Etki: bir caseId icin AYNI ANDA en fazla BIR satir isResponsible=true olabilir. Ihlal -> Postgres
-- unique_violation (P2002). !! CANLI DOGRULAMA NOTU: Prisma bu raw (sema-disi) index icin P2002
-- meta.target'ini KOLON olarak raporlar = ["caseId"] (index ADI DEGIL). Bu yuzden sorumlu-cakismasi
-- target=["caseId"] (caseId VAR, lawyerId YOK) ile ayirt edilip 409'a cevrilir -> PR-C-FU (AYRI kod PR'i).
-- Index VERIYI korur (asil invariant); FU yalnizca nadir yaris yolunda HTTP statu/mesaj kalitesidir.
--
-- !! ISIM: 'case_lawyer_one_responsible_per_case' index'in KIMLIGIDIR (DEGISTIRMEYIN). ANCAK P2002
--    eslestirmesi bu ADA gore DEGIL target kolonuna gore yapilir (bkz PR-C-FU); ad-substring kontrolu
--    yalnizca belt-and-suspenders olarak korunur.
-- !! Prisma semasi partial (WHERE) UNIQUE index'i IFADE EDEMEZ -> bu raw SQL migration'dir. Mevcut
--    "@@index([isResponsible])" (non-unique) AYRI ve DURUR. 'prisma migrate deploy' ile uygulayin;
--    'prisma migrate dev' bu index'i semada gormedigi icin "drift" sanip DROP onerebilir -- KOSMAYIN.

CREATE UNIQUE INDEX "case_lawyer_one_responsible_per_case"
  ON "CaseLawyer" ("caseId")
  WHERE "isResponsible" = true;
