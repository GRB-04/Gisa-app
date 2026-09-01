-- ============================================================================
-- Gisa / Rayyan Modernized — Supabase PostgreSQL Schema (Idempotent)
-- Hybrid Architecture (IndexedDB Local-First + Supabase Cloud)
-- ============================================================================

-- 1. Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. Projects / Collections Table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    keywords TEXT[] DEFAULT '{}',
    exclude_keywords TEXT[] DEFAULT '{}',
    review_type VARCHAR(50) DEFAULT 'systematic',
    blind_mode BOOLEAN DEFAULT FALSE,
    stats JSONB DEFAULT '{"total": 0, "included": 0, "excluded": 0, "maybe": 0, "pending": 0, "duplicates": 0}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Articles Table (High Volume)
CREATE TABLE IF NOT EXISTS public.articles (
    id VARCHAR(100) PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    title TEXT NOT NULL,
    abstract TEXT DEFAULT '',
    authors TEXT[] DEFAULT '{}',
    year VARCHAR(20) DEFAULT '',
    journal TEXT DEFAULT '',
    doi VARCHAR(255) DEFAULT '',
    keywords TEXT[] DEFAULT '{}',
    type VARCHAR(50) DEFAULT 'article',
    volume VARCHAR(50) DEFAULT '',
    issue VARCHAR(50) DEFAULT '',
    pages VARCHAR(50) DEFAULT '',
    source_file VARCHAR(255) DEFAULT '',
    decision VARCHAR(20) DEFAULT NULL, -- 'include', 'exclude', 'maybe', NULL
    exclusion_reason TEXT DEFAULT NULL,
    note TEXT DEFAULT '',
    labels TEXT[] DEFAULT '{}',
    is_duplicate BOOLEAN DEFAULT FALSE,
    duplicate_score INT DEFAULT NULL,
    duplicate_of VARCHAR(100) DEFAULT NULL,
    relevance_score INT DEFAULT NULL,
    imported_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Labels Table
CREATE TABLE IF NOT EXISTS public.labels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Collaborators Table (Multi-Reviewer / Modo Cego)
CREATE TABLE IF NOT EXISTS public.collaborators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role VARCHAR(20) DEFAULT 'reviewer', -- 'owner', 'reviewer', 'viewer'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

-- 6. Individual Decisions Table (Audit trail para Modo Cego)
CREATE TABLE IF NOT EXISTS public.reviewer_decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id VARCHAR(100) REFERENCES public.articles(id) ON DELETE CASCADE NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
    reviewer_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    decision VARCHAR(20) NOT NULL, -- 'include', 'exclude', 'maybe'
    exclusion_reason TEXT,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(article_id, reviewer_id)
);

-- ============================================================================
-- HIGH-PERFORMANCE INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_articles_project_id ON public.articles(project_id);
CREATE INDEX IF NOT EXISTS idx_articles_decision ON public.articles(project_id, decision);
CREATE INDEX IF NOT EXISTS idx_articles_is_duplicate ON public.articles(project_id, is_duplicate);
CREATE INDEX IF NOT EXISTS idx_articles_doi ON public.articles(doi);
CREATE INDEX IF NOT EXISTS idx_articles_year ON public.articles(year);
CREATE INDEX IF NOT EXISTS idx_labels_project_id ON public.labels(project_id);
CREATE INDEX IF NOT EXISTS idx_reviewer_decisions_lookup ON public.reviewer_decisions(project_id, article_id, reviewer_id);

-- Trigram index for ultra-fast title search and fuzzy matching
CREATE INDEX IF NOT EXISTS idx_articles_title_trgm ON public.articles USING gin (title gin_trgm_ops);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) - IDEMPOTENT POLICIES
-- ============================================================================
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviewer_decisions ENABLE ROW LEVEL SECURITY;

-- 1. Projects Policy
DROP POLICY IF EXISTS "Projects owner and collaborators full access" ON public.projects;
CREATE POLICY "Projects owner and collaborators full access" ON public.projects
    FOR ALL
    USING (
        auth.uid() = user_id OR
        user_id IS NULL OR
        EXISTS (
            SELECT 1 FROM public.collaborators 
            WHERE collaborators.project_id = projects.id 
            AND collaborators.user_id = auth.uid()
        )
    )
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- 2. Articles Policy
DROP POLICY IF EXISTS "Articles project access" ON public.articles;
CREATE POLICY "Articles project access" ON public.articles
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE projects.id = articles.project_id 
            AND (
                projects.user_id = auth.uid() OR
                projects.user_id IS NULL OR
                EXISTS (
                    SELECT 1 FROM public.collaborators 
                    WHERE collaborators.project_id = projects.id 
                    AND collaborators.user_id = auth.uid()
                )
            )
        )
    );

-- 3. Labels Policy
DROP POLICY IF EXISTS "Labels project access" ON public.labels;
CREATE POLICY "Labels project access" ON public.labels
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE projects.id = labels.project_id 
            AND (
                projects.user_id = auth.uid() OR
                projects.user_id IS NULL OR
                EXISTS (
                    SELECT 1 FROM public.collaborators 
                    WHERE collaborators.project_id = projects.id 
                    AND collaborators.user_id = auth.uid()
                )
            )
        )
    );

-- 4. Reviewer Decisions Policy
DROP POLICY IF EXISTS "Reviewer decisions access" ON public.reviewer_decisions;
CREATE POLICY "Reviewer decisions access" ON public.reviewer_decisions
    FOR ALL
    USING (
        reviewer_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE projects.id = reviewer_decisions.project_id 
            AND projects.blind_mode = FALSE
            AND (
                projects.user_id = auth.uid() OR
                projects.user_id IS NULL OR
                EXISTS (
                    SELECT 1 FROM public.collaborators 
                    WHERE collaborators.project_id = projects.id 
                    AND collaborators.user_id = auth.uid()
                )
            )
        )
    );

-- 5. Collaborators Policy
DROP POLICY IF EXISTS "Collaborators access policy" ON public.collaborators;
CREATE POLICY "Collaborators access policy" ON public.collaborators
    FOR ALL
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE projects.id = collaborators.project_id 
            AND projects.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE projects.id = collaborators.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- 6. Trigger helper function for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_projects_updated_at ON public.projects;
CREATE TRIGGER trigger_projects_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_articles_updated_at ON public.articles;
CREATE TRIGGER trigger_articles_updated_at
    BEFORE UPDATE ON public.articles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_reviewer_decisions_updated_at ON public.reviewer_decisions;
CREATE TRIGGER trigger_reviewer_decisions_updated_at
    BEFORE UPDATE ON public.reviewer_decisions
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- REALTIME REPLICATION (SAFE IDEMPOTENT BLOCK)
-- ============================================================================
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
    EXCEPTION WHEN duplicate_object THEN
        -- already added, ignore
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.articles;
    EXCEPTION WHEN duplicate_object THEN
        -- already added, ignore
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.labels;
    EXCEPTION WHEN duplicate_object THEN
        -- already added, ignore
    END;
END $$;
