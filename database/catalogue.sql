-- DripCartel initial product catalogue. Run database/schema.sql first, then this file.
-- Apparel sizes are intentionally limited to S, M and L.

INSERT INTO products
(id,name,category,price,stock,sizes,colours,description,image,gallery,badge) VALUES
('hoodie-original','DripCartel Signature Hoodie','Hoodies',350,24,ARRAY['S','M','L'],ARRAY['White'],
 'The DripCartel signature hoodie, shown in front and back views.','assets/originalfront.webp',ARRAY['assets/originalfront.webp','assets/originalback.webp'],'ORIGINAL'),
('tee-signature','DripCartel Signature Tee','T-Shirts',250,24,ARRAY['S','M','L'],ARRAY['White'],
 'The DripCartel signature tee, shown in front and back views.','assets/tshirt-front.webp',ARRAY['assets/tshirt-front.webp','assets/tshirt-back.webp'],'SIGNATURE'),
('tee-black','DripCartel Black Tee','T-Shirts',200,18,ARRAY['S','M','L'],ARRAY['Black'],
 'A clean black tee finished with the DripCartel mark.','assets/tshirtblackfront.webp',ARRAY['assets/tshirtblackfront.webp','assets/tshirtblackback.webp'],'NEW'),
('tee-white','DripCartel Classic White Tee','T-Shirts',200,18,ARRAY['S','M','L'],ARRAY['White'],
 'A clean classic white tee with DripCartel branding, shown in front and back views.','assets/tshirtwhitefront.webp',ARRAY['assets/tshirtwhitefront.webp','assets/tshirtwhiteback.webp'],'NEW'),
('hoodie-blue','Drip Blue Design Hoodie','Hoodies',350,14,ARRAY['S','M','L'],ARRAY['White / Blue'],
 'A bold blue DripCartel design hoodie, shown front and back.','assets/bluedesignhoodie.webp',ARRAY['assets/bluedesignhoodie.webp','assets/bluedesignhoodie-back.webp'],'NEW'),
('hoodie-pink','Drip Pink Design Hoodie','Hoodies',350,14,ARRAY['S','M','L'],ARRAY['White / Pink'],
 'A vivid pink DripCartel design hoodie, shown front and back.','assets/pinkdesignhoodie.webp',ARRAY['assets/pinkdesignhoodie.webp','assets/pinkdesignhoodie-back.webp'],'NEW'),
('hoodie-zip','DripCartel Zip Hoodie Black','Hoodies',400,14,ARRAY['S','M','L'],ARRAY['Black'],
 'A clean everyday zip hoodie with front and back views.','assets/zipper-hoodie.webp',ARRAY['assets/zipper-hoodie.webp','assets/zipper-hoodie-back.webp'],'NEW'),
('hoodie-white','DripCartel Zip Hoodie White','Hoodies',400,9,ARRAY['S','M','L'],ARRAY['White'],
 'A premium white hoodie with a small DripCartel logo, shown front and back.','assets/professional-white-hoodie-small-logo.webp',ARRAY['assets/professional-white-hoodie-small-logo.webp','assets/professional-white-hoodie-small-logo-back.webp'],'LIMITED'),
('trouser-black','DripCartel Black Trousers','Trousers',400,24,ARRAY['S','M','L'],ARRAY['Black'],
 'DripCartel black trousers with a relaxed streetwear silhouette.','assets/black-pants.webp',ARRAY['assets/black-pants.webp'],'NEW'),
('trouser-grey','DripCartel Grey Trousers','Trousers',400,24,ARRAY['S','M','L'],ARRAY['Grey'],
 'DripCartel grey trousers with a relaxed streetwear silhouette.','assets/grey-pants.webp',ARRAY['assets/grey-pants.webp'],'NEW'),
('cap-001','DripCartel Straight Cap','Caps',100,20,ARRAY['One Size'],ARRAY['Black'],
 'A structured black cap finished with the DripCartel logo.','assets/straight-cap-black.webp',ARRAY['assets/straight-cap-black.webp'],'NEW'),
('tote-001','Drip Utility Tote — Black','Tote Bags',120,22,ARRAY['One Size'],ARRAY['Black'],
 'The black DripCartel tote for everyday carry.','assets/blackback.webp',ARRAY['assets/blackback.webp'],''),
('tote-002','Drip Utility Tote — White','Tote Bags',120,16,ARRAY['One Size'],ARRAY['White'],
 'The white DripCartel tote with a clean finish.','assets/whitebag.webp',ARRAY['assets/whitebag.webp'],'NEW')
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,price=EXCLUDED.price,stock=EXCLUDED.stock,sizes=EXCLUDED.sizes,colours=EXCLUDED.colours,description=EXCLUDED.description,image=EXCLUDED.image,gallery=EXCLUDED.gallery,badge=EXCLUDED.badge,updated_at=NOW();

-- Fresh catalogue variant matrix. Existing legacy default variants are removed here because this is the initial seed.
-- Ensure every zip/zipper hoodie is priced at R400, including any existing matching catalogue rows.
UPDATE products SET price=400, updated_at=NOW() WHERE category='Hoodies' AND (LOWER(name) LIKE '%zip%' OR LOWER(name) LIKE '%zipper%');

DELETE FROM product_variants WHERE product_id IN ('hoodie-original','tee-signature','tee-black','tee-white','hoodie-blue','hoodie-pink','hoodie-zip','hoodie-white','trouser-black','trouser-grey');

INSERT INTO product_variants(product_id,sku,size,colour,stock,price) VALUES
('hoodie-original','DC-HOODIE-ORIGINAL-S','S','White',8,350),('hoodie-original','DC-HOODIE-ORIGINAL-M','M','White',8,350),('hoodie-original','DC-HOODIE-ORIGINAL-L','L','White',8,350),
('tee-signature','DC-TEE-SIGNATURE-S','S','White',8,250),('tee-signature','DC-TEE-SIGNATURE-M','M','White',8,250),('tee-signature','DC-TEE-SIGNATURE-L','L','White',8,250),
('tee-black','DC-TEE-BLACK-S','S','Black',6,200),('tee-black','DC-TEE-BLACK-M','M','Black',6,200),('tee-black','DC-TEE-BLACK-L','L','Black',6,200),
('tee-white','DC-TEE-WHITE-S','S','White',6,200),('tee-white','DC-TEE-WHITE-M','M','White',6,200),('tee-white','DC-TEE-WHITE-L','L','White',6,200),
('hoodie-blue','DC-HOODIE-BLUE-S','S','White / Blue',5,350),('hoodie-blue','DC-HOODIE-BLUE-M','M','White / Blue',5,350),('hoodie-blue','DC-HOODIE-BLUE-L','L','White / Blue',4,350),
('hoodie-pink','DC-HOODIE-PINK-S','S','White / Pink',5,350),('hoodie-pink','DC-HOODIE-PINK-M','M','White / Pink',5,350),('hoodie-pink','DC-HOODIE-PINK-L','L','White / Pink',4,350),
('hoodie-zip','DC-HOODIE-ZIP-S','S','Black',5,400),('hoodie-zip','DC-HOODIE-ZIP-M','M','Black',5,400),('hoodie-zip','DC-HOODIE-ZIP-L','L','Black',4,400),
('hoodie-white','DC-HOODIE-WHITE-S','S','White',3,400),('hoodie-white','DC-HOODIE-WHITE-M','M','White',3,400),('hoodie-white','DC-HOODIE-WHITE-L','L','White',3,400),
('trouser-black','DC-TROUSER-BLACK-S','S','Black',8,400),('trouser-black','DC-TROUSER-BLACK-M','M','Black',8,400),('trouser-black','DC-TROUSER-BLACK-L','L','Black',8,400),
('trouser-grey','DC-TROUSER-GREY-S','S','Grey',8,400),('trouser-grey','DC-TROUSER-GREY-M','M','Grey',8,400),('trouser-grey','DC-TROUSER-GREY-L','L','Grey',8,400)
ON CONFLICT (sku) DO UPDATE SET size=EXCLUDED.size,colour=EXCLUDED.colour,stock=EXCLUDED.stock,price=EXCLUDED.price,updated_at=NOW();

UPDATE products p SET stock=(SELECT COALESCE(SUM(v.stock),0) FROM product_variants v WHERE v.product_id=p.id), updated_at=NOW() WHERE p.id IN ('hoodie-original','tee-signature','tee-black','hoodie-blue','hoodie-pink','hoodie-zip','hoodie-white','trouser-black','trouser-grey');

-- Canonical storefront price lock. Re-running the seed restores the requested prices.
UPDATE products SET price = CASE id
  WHEN 'hoodie-original' THEN 350
  WHEN 'hoodie-blue' THEN 350
  WHEN 'hoodie-pink' THEN 350
  WHEN 'hoodie-zip' THEN 400
  WHEN 'hoodie-white' THEN 400
  WHEN 'tee-signature' THEN 250
  WHEN 'tee-black' THEN 200
  WHEN 'tee-white' THEN 200
  WHEN 'trouser-black' THEN 400
  WHEN 'trouser-grey' THEN 400
  WHEN 'cap-001' THEN 100
  WHEN 'tote-001' THEN 120
  WHEN 'tote-002' THEN 120
  ELSE price
END,
updated_at = NOW()
WHERE id IN ('hoodie-original','hoodie-blue','hoodie-pink','hoodie-zip','hoodie-white','tee-signature','tee-black','tee-white','trouser-black','trouser-grey','cap-001','tote-001','tote-002');

UPDATE product_variants v
SET price = CASE v.product_id
  WHEN 'hoodie-original' THEN 350
  WHEN 'hoodie-blue' THEN 350
  WHEN 'hoodie-pink' THEN 350
  WHEN 'hoodie-zip' THEN 400
  WHEN 'hoodie-white' THEN 400
  WHEN 'tee-signature' THEN 250
  WHEN 'tee-black' THEN 200
  WHEN 'tee-white' THEN 200
  WHEN 'trouser-black' THEN 400
  WHEN 'trouser-grey' THEN 400
  WHEN 'cap-001' THEN 100
  WHEN 'tote-001' THEN 120
  WHEN 'tote-002' THEN 120
  ELSE v.price
END,
updated_at = NOW()
WHERE v.product_id IN ('hoodie-original','hoodie-blue','hoodie-pink','hoodie-zip','hoodie-white','tee-signature','tee-black','tee-white','trouser-black','trouser-grey','cap-001','tote-001','tote-002');
