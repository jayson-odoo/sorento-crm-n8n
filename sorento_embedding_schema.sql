--
-- PostgreSQL database dump
--

\restrict r2jslRCn6dKTnA2tfNWXhAnxqiphHITu3twc1MlIINRxa05NoOIMAQsieZNObRP

-- Dumped from database version 17.9 (Debian 17.9-1.pgdg12+1)
-- Dumped by pg_dump version 17.7 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: embedding_chunks; Type: TABLE; Schema: public; Owner: sorento_crm
--

CREATE TABLE public.embedding_chunks (
    id uuid NOT NULL,
    document_id uuid NOT NULL,
    source_type character varying(64) NOT NULL,
    source_id character varying(128) NOT NULL,
    chunk_index integer NOT NULL,
    chunk_text text NOT NULL,
    chunk_hash character varying(64) NOT NULL,
    embedding public.vector(1536) NOT NULL,
    model_name character varying(128) NOT NULL,
    model_version character varying(64) NOT NULL,
    embedding_provider character varying(64) NOT NULL,
    source_hash character varying(64) NOT NULL,
    metadata json DEFAULT '{}'::json NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    embedded_at timestamp without time zone DEFAULT now() NOT NULL,
    superseded_at timestamp without time zone
);


ALTER TABLE public.embedding_chunks OWNER TO sorento_crm;

--
-- Name: embedding_documents; Type: TABLE; Schema: public; Owner: sorento_crm
--

CREATE TABLE public.embedding_documents (
    id uuid NOT NULL,
    source_type character varying(64) NOT NULL,
    source_id character varying(128) NOT NULL,
    source_key character varying(128),
    title character varying(255),
    body_text text NOT NULL,
    metadata json DEFAULT '{}'::json NOT NULL,
    visibility_scope character varying(64),
    source_hash character varying(64) NOT NULL,
    source_updated_at timestamp without time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.embedding_documents OWNER TO sorento_crm;

--
-- Name: embedding_queue; Type: TABLE; Schema: public; Owner: sorento_crm
--

CREATE TABLE public.embedding_queue (
    id uuid NOT NULL,
    source_type character varying(64) NOT NULL,
    source_id character varying(128) NOT NULL,
    event_type character varying(100) NOT NULL,
    event_version integer DEFAULT 1 NOT NULL,
    source_updated_at timestamp without time zone,
    source_hash character varying(64),
    payload json DEFAULT '{}'::json NOT NULL,
    status character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    available_at timestamp without time zone DEFAULT now() NOT NULL,
    last_error text,
    correlation_id uuid,
    rq_job_id character varying(64),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    processed_at timestamp without time zone
);


ALTER TABLE public.embedding_queue OWNER TO sorento_crm;

--
-- Name: embedding_chunks embedding_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: sorento_crm
--

ALTER TABLE ONLY public.embedding_chunks
    ADD CONSTRAINT embedding_chunks_pkey PRIMARY KEY (id);


--
-- Name: embedding_documents embedding_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: sorento_crm
--

ALTER TABLE ONLY public.embedding_documents
    ADD CONSTRAINT embedding_documents_pkey PRIMARY KEY (id);


--
-- Name: embedding_queue embedding_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: sorento_crm
--

ALTER TABLE ONLY public.embedding_queue
    ADD CONSTRAINT embedding_queue_pkey PRIMARY KEY (id);


--
-- Name: ix_embedding_chunks_embedding_hnsw; Type: INDEX; Schema: public; Owner: sorento_crm
--

CREATE INDEX ix_embedding_chunks_embedding_hnsw ON public.embedding_chunks USING hnsw (embedding public.vector_cosine_ops);


--
-- Name: ix_embedding_chunks_model_current; Type: INDEX; Schema: public; Owner: sorento_crm
--

CREATE INDEX ix_embedding_chunks_model_current ON public.embedding_chunks USING btree (model_name, model_version, is_current);


--
-- Name: ix_embedding_chunks_source_current; Type: INDEX; Schema: public; Owner: sorento_crm
--

CREATE INDEX ix_embedding_chunks_source_current ON public.embedding_chunks USING btree (source_type, source_id, is_current);


--
-- Name: ix_embedding_documents_source; Type: INDEX; Schema: public; Owner: sorento_crm
--

CREATE INDEX ix_embedding_documents_source ON public.embedding_documents USING btree (source_type, source_id);


--
-- Name: ix_embedding_documents_source_hash; Type: INDEX; Schema: public; Owner: sorento_crm
--

CREATE INDEX ix_embedding_documents_source_hash ON public.embedding_documents USING btree (source_type, source_id, source_hash);


--
-- Name: ix_embedding_queue_correlation_id; Type: INDEX; Schema: public; Owner: sorento_crm
--

CREATE INDEX ix_embedding_queue_correlation_id ON public.embedding_queue USING btree (correlation_id);


--
-- Name: ix_embedding_queue_source; Type: INDEX; Schema: public; Owner: sorento_crm
--

CREATE INDEX ix_embedding_queue_source ON public.embedding_queue USING btree (source_type, source_id);


--
-- Name: ix_embedding_queue_status_available_at; Type: INDEX; Schema: public; Owner: sorento_crm
--

CREATE INDEX ix_embedding_queue_status_available_at ON public.embedding_queue USING btree (status, available_at);


--
-- Name: uq_embedding_chunks_current; Type: INDEX; Schema: public; Owner: sorento_crm
--

CREATE UNIQUE INDEX uq_embedding_chunks_current ON public.embedding_chunks USING btree (source_type, source_id, model_name, model_version, chunk_index) WHERE (is_current = true);


--
-- Name: uq_embedding_documents_source; Type: INDEX; Schema: public; Owner: sorento_crm
--

CREATE UNIQUE INDEX uq_embedding_documents_source ON public.embedding_documents USING btree (source_type, source_id);


--
-- Name: embedding_chunks embedding_chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: sorento_crm
--

ALTER TABLE ONLY public.embedding_chunks
    ADD CONSTRAINT embedding_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.embedding_documents(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict r2jslRCn6dKTnA2tfNWXhAnxqiphHITu3twc1MlIINRxa05NoOIMAQsieZNObRP

