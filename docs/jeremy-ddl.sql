CREATE TABLE public.instagram_post_appearances (
    id integer NOT NULL,
    post_id integer NOT NULL,
    vendor_id integer NOT NULL,
    capture_method character varying(20) NOT NULL,
    match_evidence text,
    wedding_score integer,
    created_at timestamp without time zone DEFAULT now(),
    llm_credible boolean,
    role_label text
);
CREATE SEQUENCE public.instagram_post_appearances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.instagram_post_appearances_id_seq OWNED BY public.instagram_post_appearances.id;
CREATE TABLE public.instagram_posts (
    id integer NOT NULL,
    vendor_id integer NOT NULL,
    post_url text NOT NULL,
    location_tag character varying(255),
    caption_raw text,
    scraped_at timestamp without time zone DEFAULT now(),
    post_timestamp timestamp without time zone,
    image_url text,
    likes_count integer,
    owner_username character varying(100),
    mentions jsonb,
    hashtags jsonb,
    post_type character varying(20),
    images jsonb,
    media_width integer,
    media_height integer
);
CREATE SEQUENCE public.instagram_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.instagram_posts_id_seq OWNED BY public.instagram_posts.id;
CREATE TABLE public.vendor_social_links (
    id integer NOT NULL,
    vendor_id integer NOT NULL,
    platform character varying(50) NOT NULL,
    url character varying(500) NOT NULL,
    found_at timestamp without time zone DEFAULT now()
);
CREATE SEQUENCE public.vendor_social_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.vendor_social_links_id_seq OWNED BY public.vendor_social_links.id;
CREATE TABLE public.vendors (
    id integer NOT NULL,
    place_id character varying(255),
    name character varying(255) NOT NULL,
    category character varying(100),
    primary_type character varying(100),
    place_types jsonb,
    address text,
    short_address character varying(255),
    neighborhood character varying(100),
    city character varying(100) DEFAULT 'Chicago'::character varying,
    state character varying(50) DEFAULT 'IL'::character varying,
    zip character varying(20),
    phone character varying(50),
    website character varying(500),
    google_maps_url character varying(500),
    rating numeric(2,1),
    review_count integer,
    price_level integer,
    photos jsonb,
    opening_hours jsonb,
    editorial_summary text,
    ai_summary text,
    review_summary text,
    outdoor_seating boolean,
    live_music boolean,
    good_for_groups boolean,
    allows_dogs boolean,
    serves_cocktails boolean,
    serves_wine boolean,
    serves_beer boolean,
    serves_dinner boolean,
    restroom boolean,
    reservable boolean,
    wheelchair_accessible_entrance boolean,
    wheelchair_accessible_seating boolean,
    parking_options jsonb,
    payment_options jsonb,
    lat numeric(10,8),
    lng numeric(11,8),
    ai_tags jsonb,
    search_term character varying(255),
    is_claimed boolean DEFAULT false,
    claimed_by_user_id integer,
    featured boolean DEFAULT false,
    last_updated timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now(),
    instagram_handle character varying(100),
    photo_cdn_urls jsonb,
    photo_cdn_cached_at timestamp without time zone,
    discovery_source character varying(30) DEFAULT 'google_places'::character varying NOT NULL
);
CREATE SEQUENCE public.vendors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.vendors_id_seq OWNED BY public.vendors.id;
CREATE TABLE public.venue_enrichment (
    vendor_id integer NOT NULL,
    website text,
    status character varying(32) DEFAULT 'partial'::character varying NOT NULL,
    needs_review boolean DEFAULT false NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    capacity_max integer,
    capacity_min integer,
    capacity_as_stated text,
    catering character varying(64),
    event_insurance character varying(64),
    pricing_model character varying(64),
    price_display text,
    facts jsonb DEFAULT '{}'::jsonb NOT NULL,
    latest_rules_run_id integer,
    latest_llm_run_id integer,
    crawled_at timestamp with time zone,
    extracted_at timestamp with time zone,
    enriched_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.venue_extraction_runs (
    id integer NOT NULL,
    vendor_id integer NOT NULL,
    method character varying(80) NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    status character varying(32) DEFAULT 'success'::character varying NOT NULL,
    payload jsonb NOT NULL,
    meta jsonb,
    crawled_at timestamp with time zone,
    extracted_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE SEQUENCE public.venue_extraction_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.venue_extraction_runs_id_seq OWNED BY public.venue_extraction_runs.id;
ALTER TABLE ONLY public.instagram_post_appearances ALTER COLUMN id SET DEFAULT nextval('public.instagram_post_appearances_id_seq'::regclass);
ALTER TABLE ONLY public.instagram_posts ALTER COLUMN id SET DEFAULT nextval('public.instagram_posts_id_seq'::regclass);
ALTER TABLE ONLY public.vendor_social_links ALTER COLUMN id SET DEFAULT nextval('public.vendor_social_links_id_seq'::regclass);
ALTER TABLE ONLY public.vendors ALTER COLUMN id SET DEFAULT nextval('public.vendors_id_seq'::regclass);
ALTER TABLE ONLY public.venue_extraction_runs ALTER COLUMN id SET DEFAULT nextval('public.venue_extraction_runs_id_seq'::regclass);
ALTER TABLE ONLY public.instagram_post_appearances
    ADD CONSTRAINT instagram_post_appearances_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.instagram_posts
    ADD CONSTRAINT instagram_posts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.instagram_posts
    ADD CONSTRAINT instagram_posts_post_url_key UNIQUE (post_url);
ALTER TABLE ONLY public.instagram_post_appearances
    ADD CONSTRAINT unique_post_vendor_method UNIQUE (post_id, vendor_id, capture_method);
ALTER TABLE ONLY public.vendor_social_links
    ADD CONSTRAINT unique_vendor_platform_url UNIQUE (vendor_id, platform, url);
ALTER TABLE ONLY public.vendor_social_links
    ADD CONSTRAINT vendor_social_links_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_place_id_key UNIQUE (place_id);
ALTER TABLE ONLY public.venue_enrichment
    ADD CONSTRAINT venue_enrichment_pkey PRIMARY KEY (vendor_id);
ALTER TABLE ONLY public.venue_extraction_runs
    ADD CONSTRAINT venue_extraction_runs_pkey PRIMARY KEY (id);
CREATE INDEX idx_appearances_llm_credible ON public.instagram_post_appearances USING btree (llm_credible);
CREATE INDEX idx_appearances_post ON public.instagram_post_appearances USING btree (post_id);
CREATE INDEX idx_appearances_vendor ON public.instagram_post_appearances USING btree (vendor_id);
CREATE INDEX idx_instagram_posts_vendor_id ON public.instagram_posts USING btree (vendor_id);
CREATE INDEX idx_vendor_social_links_vendor_id ON public.vendor_social_links USING btree (vendor_id);
CREATE INDEX idx_venue_enrichment_capacity_max ON public.venue_enrichment USING btree (capacity_max);
CREATE INDEX idx_venue_enrichment_catering ON public.venue_enrichment USING btree (catering);
CREATE INDEX idx_venue_enrichment_needs_review ON public.venue_enrichment USING btree (needs_review) WHERE (needs_review = true);
CREATE INDEX idx_venue_enrichment_status ON public.venue_enrichment USING btree (status);
CREATE INDEX idx_venue_extraction_runs_extracted_at ON public.venue_extraction_runs USING btree (extracted_at DESC);
CREATE INDEX idx_venue_extraction_runs_method ON public.venue_extraction_runs USING btree (method);
CREATE INDEX idx_venue_extraction_runs_vendor_id ON public.venue_extraction_runs USING btree (vendor_id);
CREATE UNIQUE INDEX vendors_ig_handle_unique_discovered ON public.vendors USING btree (lower((instagram_handle)::text)) WHERE ((instagram_handle IS NOT NULL) AND ((discovery_source)::text <> 'google_places'::text));
ALTER TABLE ONLY public.instagram_post_appearances
    ADD CONSTRAINT instagram_post_appearances_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.instagram_posts(id);
ALTER TABLE ONLY public.instagram_post_appearances
    ADD CONSTRAINT instagram_post_appearances_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);
ALTER TABLE ONLY public.instagram_posts
    ADD CONSTRAINT instagram_posts_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);
ALTER TABLE ONLY public.vendor_social_links
    ADD CONSTRAINT vendor_social_links_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id);
ALTER TABLE ONLY public.venue_enrichment
    ADD CONSTRAINT venue_enrichment_latest_llm_run_id_fkey FOREIGN KEY (latest_llm_run_id) REFERENCES public.venue_extraction_runs(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.venue_enrichment
    ADD CONSTRAINT venue_enrichment_latest_rules_run_id_fkey FOREIGN KEY (latest_rules_run_id) REFERENCES public.venue_extraction_runs(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.venue_enrichment
    ADD CONSTRAINT venue_enrichment_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.venue_extraction_runs
    ADD CONSTRAINT venue_extraction_runs_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE CASCADE;
