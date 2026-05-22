ALTER TABLE public.feature_requests
ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal';

CREATE INDEX idx_feature_requests_priority ON public.feature_requests(priority);