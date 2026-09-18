
CREATE TABLE public.shared_decks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  deck JSONB NOT NULL,
  updated_at BIGINT NOT NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_decks TO anon, authenticated;
GRANT ALL ON public.shared_decks TO service_role;
ALTER TABLE public.shared_decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON public.shared_decks FOR SELECT USING (true);
CREATE POLICY "public insert" ON public.shared_decks FOR INSERT WITH CHECK (true);
CREATE POLICY "public update" ON public.shared_decks FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete" ON public.shared_decks FOR DELETE USING (true);
